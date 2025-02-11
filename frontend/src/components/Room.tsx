import React, { useEffect, useRef, useState } from "react";
import { Socket, io } from "socket.io-client";
import { ICE_SERVERS } from "./Landing";

export const Room = ({
  name,
  localAudioTrack,
  localVideoTrack,
}: {
  name: string;
  localAudioTrack: MediaStreamTrack | null;
  localVideoTrack: MediaStreamTrack | null;
}) => {
  const [lobby, setLobby] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [sendingPc, setSendingPc] = useState<RTCPeerConnection | null>(null);
  const [receivingPc, setReceivingPc] = useState<RTCPeerConnection | null>(
    null
  );
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const currentRoomId = useRef<string | null>(null);

  const playVideo = async (videoElement: HTMLVideoElement): Promise<void> => {
    try {
      await videoElement.play();
      console.log("Video playback started successfully");
    } catch (err) {
      console.warn("Video playback failed:", err);
      setConnectionError("Video playback failed. Click to retry.");
    }
  };

  useEffect(() => {
    const setupLocalVideo = async () => {
      if (!localVideoRef.current || !localVideoTrack || !localAudioTrack)
        return;

      try {
        const stream = new MediaStream();
        stream.addTrack(localVideoTrack);
        stream.addTrack(localAudioTrack);
        localStreamRef.current = stream;

        localVideoRef.current.srcObject = stream;

        localVideoRef.current.onloadedmetadata = () => {
          console.log("Local video metadata loaded");
          localVideoRef.current?.play().catch((error) => {
            console.error("Error playing local video:", error);
          });
        };
      } catch (err) {
        console.error("Local video setup failed:", err);
        setConnectionError("Failed to setup local video. Click to retry.");
      }
    };

    setupLocalVideo();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [localVideoTrack, localAudioTrack]);
  const setupRemoteVideo = async (stream: MediaStream) => {
    if (!remoteVideoRef.current) return;

    try {
      remoteVideoRef.current.srcObject = stream;

      remoteVideoRef.current.onloadedmetadata = () => {
        console.log("Remote video metadata loaded");
        remoteVideoRef.current?.play().catch((error) => {
          console.error("Error playing remote video:", error);
        });
      };

      setConnectionError(null);
    } catch (err) {
      console.warn("Remote video setup failed:", err);
      setConnectionError("Remote video failed. Click to retry.");
    }
  };

  const handleVideoClick = async (
    videoRef: React.RefObject<HTMLVideoElement>
  ) => {
    if (!videoRef.current) return;

    try {
      if (videoRef.current.paused) {
        await playVideo(videoRef.current);
        setConnectionError(null);
      }
    } catch (err) {
      console.error("Error playing video on click:", err);
      setConnectionError("Video playback failed. Please try again.");
    }
  };

  const createPeerConnection = () => {
    try {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      console.log("Created new peer connection");
      return pc;
    } catch (error) {
      console.error("Failed to create PeerConnection:", error);
      setConnectionError("Failed to create peer connection");
      return null;
    }
  };

  const setupSocketHandlers = (socketInstance: Socket) => {
    socketInstance.on("send-offer", async ({ roomId }) => {
      console.log("Received send-offer event for room:", roomId);
      currentRoomId.current = roomId;
      setLobby(false);

      const pc = createPeerConnection();
      if (!pc) return;

      setSendingPc(pc);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("Sending ICE candidate:", event.candidate);
          socketInstance.emit("add-ice-candidate", {
            candidate: event.candidate,
            type: "sender",
            roomId,
          });
        } else {
          console.log("No more ICE candidates.");
        }
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (socketInstance.connected) {
          socketInstance.emit("offer", { sdp: offer, roomId });
          console.log("Sent offer for room:", roomId);
        }
      } catch (err) {
        console.error("Error creating/sending offer:", err);
        setConnectionError("Failed to create connection offer");
      }
    });

    socketInstance.on("offer", async ({ roomId, sdp: remoteSdp }) => {
      console.log("Received offer for room:", roomId);
      currentRoomId.current = roomId;
      setLobby(false);

      const pc = createPeerConnection();
      if (!pc) return;

      setReceivingPc(pc);

      const newRemoteStream = new MediaStream();
      setRemoteStream(newRemoteStream);

      pc.ontrack = (event) => {
        console.log("Received remote track:", event.track.kind);
        if (event.track.kind === "video") {
          console.log("Remote video track added");
        } else if (event.track.kind === "audio") {
          console.log("Remote audio track added");
        }
        newRemoteStream.addTrack(event.track);
        setupRemoteVideo(newRemoteStream);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socketInstance.connected) {
          console.log("Sending ICE candidate from receiver");
          socketInstance.emit("add-ice-candidate", {
            candidate: event.candidate,
            type: "receiver",
            roomId,
          });
        }
      };

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(remoteSdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (socketInstance.connected) {
          socketInstance.emit("answer", { sdp: answer, roomId });
          console.log("Sent answer for room:", roomId);
        }
      } catch (err) {
        console.error("Error handling offer:", err);
        setConnectionError("Failed to establish connection");
      }
    });

    socketInstance.on("answer", async ({ sdp: remoteSdp }) => {
      console.log("Received answer");
      try {
        if (sendingPc && sendingPc.signalingState !== "closed") {
          await sendingPc.setRemoteDescription(
            new RTCSessionDescription(remoteSdp)
          );
          console.log("Set remote description from answer");
        }
      } catch (err) {
        console.error("Error handling answer:", err);
        setConnectionError("Failed to complete connection setup");
      }
    });

    socketInstance.on("add-ice-candidate", async ({ candidate, type }) => {
      try {
        const candidateObj = new RTCIceCandidate(candidate);
        if (
          type === "sender" &&
          receivingPc &&
          receivingPc.signalingState !== "closed"
        ) {
          await receivingPc.addIceCandidate(candidateObj);
          console.log("Added ICE candidate to receiving PC");
        } else if (
          type === "receiver" &&
          sendingPc &&
          sendingPc.signalingState !== "closed"
        ) {
          await sendingPc.addIceCandidate(candidateObj);
          console.log("Added ICE candidate to sending PC");
        }
      } catch (err) {
        console.error("Error adding ICE candidate:", err);
      }
    });

    socketInstance.on("disconnect", () => {
      console.log("Disconnected from server");
      setLobby(true);
      cleanup();
    });
  };

  const cleanup = () => {
    if (sendingPc) {
      sendingPc.close();
      setSendingPc(null);
    }
    if (receivingPc) {
      receivingPc.close();
      setReceivingPc(null);
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach((track) => track.stop());
      setRemoteStream(null);
    }
  };

  useEffect(() => {
    const socketInstance = io("http://localhost:3000", {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      timeout: 20000,
    });

    socketInstance.on("connect", () => {
      console.log("Connected to server:", socketInstance.id);
    });

    socketInstance.on("connect_error", (error) => {
      console.error("Connection error:", error);
    });

    socketInstance.on("disconnect", (reason) => {
      console.log("Disconnected from server. Reason:", reason);
    });

    return () => {
      socketInstance.disconnect();
    };
  }, []);
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      {connectionError && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
          {connectionError}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl">
        <div className="relative">
          <h2 className="text-lg font-semibold text-gray-700 mb-2">
            Your Video
          </h2>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full rounded-lg shadow-lg bg-black cursor-pointer"
            onClick={() => handleVideoClick(localVideoRef)}
          />
        </div>
        <div className="relative">
          <h2 className="text-lg font-semibold text-gray-700 mb-2">
            Remote Video
          </h2>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full rounded-lg shadow-lg bg-black cursor-pointer"
            onClick={() => handleVideoClick(remoteVideoRef)}
          />
        </div>
      </div>
      {lobby && !connectionError && (
        <div className="mt-4 text-lg text-gray-600 animate-pulse">
          Waiting to connect you with someone...
        </div>
      )}
    </div>
  );
};
