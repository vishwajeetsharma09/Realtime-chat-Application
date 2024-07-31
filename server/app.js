const express = require("express");
const multer = require("multer");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const io = require("socket.io")(3000, {
  cors: {
    origin: "http://localhost:3001",
  },
});

// Ensure the uploads directory exists
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// Connect DB
require("./db/connection");

// Import Models
const Users = require("./models/Users");
const Conversations = require("./models/Conversations");
const Messages = require("./models/Messages");

// Express app setup
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(cors());

const port = process.env.PORT || 8000;

// Socket.io setup
let users = [];
io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  socket.on("addUser", (userId) => {
    const isUserExist = users.find((user) => user.userId === userId);
    if (!isUserExist) {
      const user = { userId, socketId: socket.id };
      users.push(user);
      io.emit("getUsers", users);
    }
  });

  socket.on(
    "sendMessage",
    async ({ senderId, receiverId, message, conversationId, filePaths }) => {
      const receiver = users.find((user) => user.userId === receiverId);
      const sender = users.find((user) => user.userId === senderId);
      const user = await Users.findById(senderId);
      const messageData = {
        senderId,
        message,
        filePaths, // Ensure this is an array of file paths
        conversationId,
        receiverId,
        user: { id: user._id, fullName: user.fullName, email: user.email },
      };
      if (receiver) {
        io.to(receiver.socketId)
          .to(sender.socketId)
          .emit("getMessage", messageData);
      } else {
        io.to(sender.socketId).emit("getMessage", messageData);
      }
    }
  );

  socket.on("disconnect", () => {
    users = users.filter((user) => user.socketId !== socket.id);
    io.emit("getUsers", users);
  });
});

// Routes
app.get("/", (req, res) => {
  res.send("Welcome");
});

app.post("/api/register", async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).send("Please fill all required fields");
    }
    const isAlreadyExist = await Users.findOne({ email });
    if (isAlreadyExist) {
      return res.status(400).send("User already exists");
    }
    const newUser = new Users({ fullName, email });
    bcryptjs.hash(password, 10, async (err, hashedPassword) => {
      if (err) {
        return res.status(500).send("Error hashing password");
      }
      newUser.set("password", hashedPassword);
      await newUser.save();
      res.status(200).send("User registered successfully");
    });
  } catch (error) {
    console.log(error, "Error");
    res.status(500).send("Server error");
  }
});

app.post("/api/upload", upload.array("files"), (req, res) => {
  try {
    const filePaths = req.files.map((file) => file.path.replace(/\\/g, "/")); // Ensure paths use forward slashes
    console.log(req.files);
    res.status(200).json({ filePaths });
  } catch (error) {
    console.log(error, "Error uploading files");
    res.status(500).send("Error uploading files");
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).send("Please fill all required fields");
    }
    const user = await Users.findOne({ email });
    if (!user) {
      return res.status(400).send("User email or password is incorrect");
    }
    const validateUser = await bcryptjs.compare(password, user.password);
    if (!validateUser) {
      return res.status(400).send("User email or password is incorrect");
    }
    const payload = {
      userId: user._id,
      email: user.email,
    };
    const JWT_SECRET_KEY =
      process.env.JWT_SECRET_KEY || "THIS_IS_A_JWT_SECRET_KEY";
    jwt.sign(
      payload,
      JWT_SECRET_KEY,
      { expiresIn: 84600 },
      async (err, token) => {
        if (err) {
          return res.status(500).send("Error generating token");
        }
        await Users.updateOne({ _id: user._id }, { $set: { token } });
        res.status(200).json({
          user: {
            id: user._id,
            email: user.email,
            fullName: user.fullName,
          },
          token,
        });
      }
    );
  } catch (error) {
    console.log(error, "Error");
    res.status(500).send("Server error");
  }
});

app.post("/api/conversation", async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;
    const newConversation = new Conversations({
      members: [senderId, receiverId],
    });
    await newConversation.save();
    res.status(200).send("Conversation created successfully");
  } catch (error) {
    console.log(error, "Error");
    res.status(500).send("Server error");
  }
});

app.get("/api/conversations/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const conversations = await Conversations.find({
      members: { $in: [userId] },
    });
    const conversationUserData = await Promise.all(
      conversations.map(async (conversation) => {
        const receiverId = conversation.members.find(
          (member) => member !== userId
        );
        const user = await Users.findById(receiverId);
        return {
          user: {
            receiverId: user._id,
            email: user.email,
            fullName: user.fullName,
          },
          conversationId: conversation._id,
        };
      })
    );
    res.status(200).json(conversationUserData);
  } catch (error) {
    console.log(error, "Error");
    res.status(500).send("Server error");
  }
});

// Route to handle sending messages
app.post("/api/message", async (req, res) => {
  try {
    const {
      conversationId,
      senderId,
      message,
      receiverId = "",
      filePaths = [],
    } = req.body;
    if (!senderId || !message) {
      return res.status(400).send("Please fill all required fields");
    }
    if (conversationId === "new" && receiverId) {
      const newConversation = new Conversations({
        members: [senderId, receiverId],
      });
      await newConversation.save();
      const newMessage = new Messages({
        conversationId: newConversation._id,
        senderId,
        message,
        filePaths,
      });
      await newMessage.save();
      return res.status(200).send("Message sent successfully");
    } else if (!conversationId && !receiverId) {
      return res.status(400).send("Please fill all required fields");
    }
    const newMessage = new Messages({
      conversationId,
      senderId,
      message,
      filePaths,
    });
    await newMessage.save();
    res.status(200).send("Message sent successfully");
  } catch (error) {
    console.log(error, "Error");
    res.status(500).send("Server error");
  }
});

app.get("/api/message/:conversationId", async (req, res) => {
  try {
    const checkMessages = async (conversationId) => {
      const messages = await Messages.find({ conversationId });
      const messageUserData = await Promise.all(
        messages.map(async (message) => {
          const user = await Users.findById(message.senderId);
          return {
            user: { id: user._id, email: user.email, fullName: user.fullName },
            message: message.message,
          };
        })
      );
      res.status(200).json(messageUserData);
    };

    const conversationId = req.params.conversationId;
    if (conversationId === "new") {
      const checkConversation = await Conversations.find({
        members: { $all: [req.query.senderId, req.query.receiverId] },
      });
      if (checkConversation.length > 0) {
        checkMessages(checkConversation[0]._id);
      } else {
        return res.status(200).json([]);
      }
    } else {
      checkMessages(conversationId);
    }
  } catch (error) {
    console.log("Error", error);
    res.status(500).send("Server error");
  }
});

app.get("/api/users/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await Users.findById(userId);
    if (user) {
      res.status(200).json({
        id: user._id,
        email: user.email,
        fullName: user.fullName,
      });
    } else {
      res.status(404).send("User not found");
    }
  } catch (error) {
    console.log("Error", error);
    res.status(500).send("Server error");
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
