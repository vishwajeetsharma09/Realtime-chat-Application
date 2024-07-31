require("dotenv").config();
const mongoose = require("mongoose");

const url =
  "mongodb+srv://demo:demo@cluster0.idft8qs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose
  .connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to DB"))
  .catch((e) => console.log("Error", e));
