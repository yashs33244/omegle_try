"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const socket_io_1 = require("socket.io");
const UserManager_1 = require("./managers/UserManager");
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
app.use((0, cors_1.default)({
    origin: "*", // In production, replace with your frontend URL
    methods: ["GET", "POST"],
    credentials: true
}));
const io = new socket_io_1.Server(server, {
    cors: {
        origin: "*"
    }
});
const userManager = new UserManager_1.UserManager();
io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);
    socket.on('disconnect', (reason) => {
        console.log('user disconnected:', socket.id, 'Reason:', reason);
    });
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});
const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
