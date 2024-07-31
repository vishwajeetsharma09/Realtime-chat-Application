import { useEffect, useRef, useState } from "react";
import Img1 from "../../assets/img1.jpg";
import tutorialsdev from "../../assets/tutorialsdev.png";
import Input from "../../components/Input";
import { io } from "socket.io-client";

const Dashboard = () => {
  const [user, setUser] = useState(
    JSON.parse(localStorage.getItem("user:detail"))
  );
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState({});
  const [message, setMessage] = useState("");
  const [users, setUsers] = useState([]);
  const [images, setImages] = useState([]);
  const [videos, setVideos] = useState([]);
  const [socket, setSocket] = useState(null);
  const displayImage = (filename) =>
    `http://localhost:8000/uploads/${filename}`;

  const messageRef = useRef(null);

  useEffect(() => {
    const newSocket = io("http://localhost:8080");
    setSocket(newSocket);
    return () => newSocket.close();
  }, []);

  useEffect(() => {
    if (socket) {
      socket.emit("addUser", user?.id);

      socket.on("getUsers", (users) => {
        console.log("Active Users: ", users);
        setUsers(users); // Update users state with active users
      });

      socket.on("getMessage", (data) => {
        setMessages((prev) => ({
          ...prev,
          messages: [
            ...prev.messages,
            { user: data.user, message: data.message },
          ],
        }));
      });
    }
  }, [socket, user]);

  useEffect(() => {
    messageRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.messages]);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const res = await fetch(
          `http://localhost:8000/api/conversations/${user?.id}`
        );
        if (!res.ok) throw new Error("Failed to fetch conversations");
        const resData = await res.json();
        setConversations(resData);
      } catch (error) {
        console.error("Error fetching conversations:", error);
      }
    };
    fetchConversations();
  }, [user?.id]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/users/${user?.id}`);
        if (!res.ok) throw new Error("Failed to fetch users");
        const resData = await res.json();
        setUsers(resData);
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };
    fetchUsers();
  }, [user?.id]);

  const fetchMessages = async (conversationId, receiver) => {
    try {
      const res = await fetch(
        `http://localhost:8000/api/message/${conversationId}?senderId=${user?.id}&receiverId=${receiver?.receiverId}`
      );
      if (!res.ok) throw new Error("Failed to fetch messages");
      const resData = await res.json();
      setMessages({ messages: resData, receiver, conversationId });
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  const handleFileUpload = async (event, type) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });

    try {
      const uploadRes = await fetch(`http://localhost:8000/api/upload`, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Failed to upload files");
      const uploadData = await uploadRes.json();

      if (type === "image") {
        setImages((prev) => [...prev, ...files]);
      } else if (type === "video") {
        setVideos((prev) => [...prev, ...files]);
      }
    } catch (error) {
      console.error("Error uploading file:", error);
    }
  };

  const triggerFileInput = (type) => {
    document.querySelector(`#file-input-${type}`).click();
  };

  const sendMessage = async () => {
    if (!message && images.length === 0 && videos.length === 0) {
      return; // Do nothing if there's no message or files to send
    }

    const messageContent = {
      senderId: user?.id,
      receiverId: messages?.receiver?.receiverId,
      message: message || "",
      conversationId: messages?.conversationId,
      images,
      videos,
    };

    try {
      socket.emit("sendMessage", messageContent);

      await fetch(`http://localhost:8000/api/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messageContent),
      });

      setMessage("");
      setImages([]);
      setVideos([]);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  return (
    <div className="w-screen flex">
      <div className="w-[25%] h-screen bg-secondary overflow-scroll">
        <div className="flex items-center my-8 mx-14">
          <div>
            <img
              src={tutorialsdev}
              width={75}
              height={75}
              className="border border-primary p-[2px] rounded-full"
            />
          </div>
          <div className="ml-8">
            <h3 className="text-2xl">{user?.fullName}</h3>
            <p className="text-lg font-light">My Account</p>
          </div>
        </div>
        <hr />
        <div className="mx-14 mt-10">
          <div className="text-primary text-lg">Messages</div>
          <div>
            {conversations.length > 0 ? (
              conversations.map(({ conversationId, user }) => (
                <div
                  className="flex items-center py-8 border-b border-b-gray-300"
                  key={conversationId}
                  onClick={() => fetchMessages(conversationId, user)}
                >
                  <div className="cursor-pointer flex items-center">
                    <div>
                      <img
                        src={Img1}
                        className="w-[60px] h-[60px] rounded-full p-[2px] border border-primary"
                      />
                    </div>
                    <div className="ml-6">
                      <h3 className="text-lg font-semibold">
                        {user?.fullName}
                      </h3>
                      <p className="text-sm font-light text-gray-600">
                        {user?.email}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-lg font-semibold mt-24">
                No Conversations
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="w-[50%] h-screen bg-white flex flex-col items-center">
        {messages?.receiver?.fullName && (
          <div className="w-[75%] bg-secondary h-[80px] my-14 rounded-full flex items-center px-14 py-2">
            <div className="cursor-pointer">
              <img src={Img1} width={60} height={60} className="rounded-full" />
            </div>
            <div className="ml-6 mr-auto">
              <h3 className="text-lg">{messages?.receiver?.fullName}</h3>
              <p className="text-sm font-light text-gray-600">
                {messages?.receiver?.email}
              </p>
            </div>
            <div className="cursor-pointer flex items-center">
              <img src={tutorialsdev} width={30} height={30} />
              <div className="ml-2">Logout</div>
            </div>
          </div>
        )}
        <div className="w-[75%] h-[70%] bg-white overflow-scroll">
          <div className="w-full p-14">
            {messages?.messages?.length > 0 ? (
              messages?.messages.map(({ user, message }, index) => (
                <div
                  className={`flex items-center mb-4 ${
                    user?.id === user?.id ? "justify-end" : "justify-start"
                  }`}
                  key={index}
                >
                  <div
                    className={`py-2 px-4 rounded-xl ${
                      user?.id === user?.id
                        ? "bg-primary text-white"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {message}
                  </div>
                  <div ref={messageRef} />
                </div>
              ))
            ) : (
              <div className="text-center font-semibold text-lg mt-24">
                No Messages
              </div>
            )}
          </div>
        </div>
        {messages?.receiver?.fullName && (
          <div className="w-full flex items-center px-14 mt-6">
            <Input
              className="w-[75%]"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message"
            />
            <button
              className="ml-8 py-4 px-8 rounded-full bg-primary shadow-sm text-white"
              onClick={sendMessage}
            >
              Send
            </button>
            <div className="ml-8">
              <input
                type="file"
                id="file-input-image"
                accept="image/*"
                onChange={(e) => handleFileUpload(e, "image")}
                style={{ display: "none" }}
              />
              <button
                className="py-2 px-4 rounded-full bg-secondary shadow-sm"
                onClick={() => triggerFileInput("image")}
              >
                Upload Image
              </button>
            </div>
            <div className="ml-8">
              <input
                type="file"
                id="file-input-video"
                accept="video/*"
                onChange={(e) => handleFileUpload(e, "video")}
                style={{ display: "none" }}
              />
              <button
                className="py-2 px-4 rounded-full bg-secondary shadow-sm"
                onClick={() => triggerFileInput("video")}
              >
                Upload Video
              </button>
            </div>
          </div>
        )}
        <div className="w-full flex flex-wrap p-14">
          {images.length > 0 &&
            images.map((image, index) => (
              <img
                key={index}
                src={URL.createObjectURL(image)}
                alt="Uploaded"
                className="w-[100px] h-[100px] m-2"
              />
            ))}
          {videos.length > 0 &&
            videos.map((video, index) => (
              <video
                key={index}
                src={URL.createObjectURL(video)}
                controls
                className="w-[200px] h-[150px] m-2"
              />
            ))}
        </div>
      </div>
      <div className="w-[25%] h-screen bg-secondary"></div>
    </div>
  );
};

export default Dashboard;
