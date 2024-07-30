// @ts-ignore
import {Socket} from "socket.io";   
import http from "http";    

import express from "express"; 
// @ts-ignore
import {Server} from "socket.io";
// @ts-ignore
import {UserManager} from "./managers/UserManager";  

const app = express();  
const server = http.createServer(app); 

const io = new Server(server,{
    cors:{
        origin:"*"
    }
})

const userManager = new UserManager();  

io.on("connection", (socket: Socket) => {
    console.log("a user connected");
    userManager.addUser("random Name", socket);

    // on disconnect
    socket.on("disconnect", () => {
        console.log("user disconnected");
        userManager.removeUser(socket.id); 
    });
})

server.listen(3000,()=>{
    console.log("Server is running on port 3000");  
})