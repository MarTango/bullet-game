const express = require("express");
const path = require("path");
const port = process.env.PORT || 8080;
const http = require("http");
const sockio = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = sockio(server);

io.on("connect", (socket) => {
  console.log("connected", socket);
  socket.on("alpha", (msg) => {
    console.log("broadcasting", msg);
    socket.broadcast.emit("alpha", { from: socket.id, ...msg });
  });
});

app.use(express.static(`${__dirname}/dist`));

app.get("/", (req, res) => {
  console.log(req);
  res.sendFile(path.resolve(__dirname, "dist", "index.html"));
});

server.listen(port);
