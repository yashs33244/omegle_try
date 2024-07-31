import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Socket, io } from "socket.io-client";

const URL = "https://omegle-try.onrender.com";

// Configuration for ICE servers
const iceServers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    // Add TURN server configuration here if you have one
    // {
    //   urls: "turn:your-turn-server.com:3478",
    //   username: "username",
    //   credential: "password"
    // }
  ],
};

export const Room = ({
  name,
  localAudioTrack,
  localVideoTrack,
}: {
  name: string;
  localAudioTrack: MediaStreamTrack | null;
  localVideoTrack: MediaStreamTrack | null;
}) => {
  //@ts-ignore
  const [searchParams, setSearchParams] = useSearchParams();
  const [lobby, setLobby] = useState(true);
  //@ts-ignore
  const [socket, setSocket] = useState<Socket | null>(null);
  const [sendingPc, setSendingPc] = useState<RTCPeerConnection | null>(null);
  const [receivingPc, setReceivingPc] = useState<RTCPeerConnection | null>(
    null
  );
  const [remoteVideoTrack, setRemoteVideoTrack] =
    useState<MediaStreamTrack | null>(null);
  const [remoteAudioTrack, setRemoteAudioTrack] =
    useState<MediaStreamTrack | null>(null);
  //@ts-ignore
  const [remoteMediaStream, setRemoteMediaStream] =
    useState<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const socket = io(URL);
    socket.on("send-offer", async ({ roomId }) => {
      console.log("sending offer");
      setLobby(false);
      const pc = new RTCPeerConnection(iceServers);

      setSendingPc(pc);
      if (localVideoTrack) {
        console.log("Added local video track");
        pc.addTrack(localVideoTrack);
      }
      if (localAudioTrack) {
        console.log("Added local audio track");
        pc.addTrack(localAudioTrack);
      }

      pc.onicecandidate = async (e) => {
        console.log("Sending ICE candidate");
        if (e.candidate) {
          socket.emit("add-ice-candidate", {
            candidate: e.candidate,
            type: "sender",
            roomId,
          });
        }
      };

      pc.onnegotiationneeded = async () => {
        console.log("On negotiation needed, sending offer");
        const sdp = await pc.createOffer();
        await pc.setLocalDescription(sdp);
        socket.emit("offer", {
          sdp,
          roomId,
        });
      };
    });

    socket.on("offer", async ({ roomId, sdp: remoteSdp }) => {
      console.log("Received offer");
      setLobby(false);
      const pc = new RTCPeerConnection(iceServers);
      await pc.setRemoteDescription(new RTCSessionDescription(remoteSdp));
      const sdp = await pc.createAnswer();
      await pc.setLocalDescription(sdp);

      const stream = new MediaStream();
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }

      setRemoteMediaStream(stream);
      setReceivingPc(pc);

      pc.ontrack = (e) => {
        console.log("Received remote track", e.track.kind);
        if (e.track.kind === "audio") {
          setRemoteAudioTrack(e.track);
        } else if (e.track.kind === "video") {
          setRemoteVideoTrack(e.track);
        }
        if (
          remoteVideoRef.current &&
          remoteVideoRef.current.srcObject instanceof MediaStream
        ) {
          (remoteVideoRef.current.srcObject as MediaStream).addTrack(e.track);
        }
      };

      pc.onicecandidate = async (e) => {
        if (e.candidate) {
          console.log("Sending ICE candidate");
          socket.emit("add-ice-candidate", {
            candidate: e.candidate,
            type: "receiver",
            roomId,
          });
        }
      };

      socket.emit("answer", {
        roomId,
        sdp: pc.localDescription,
      });
    });
    // @ts-ignore
    socket.on("answer", async ({ roomId, sdp: remoteSdp }) => {
      setLobby(false);
      const desc = new RTCSessionDescription(remoteSdp);
      await sendingPc?.setRemoteDescription(desc);
      console.log("Answer processed");
    });

    socket.on("lobby", () => {
      setLobby(true);
    });

    socket.on("add-ice-candidate", async ({ candidate, type }) => {
      console.log("Received ICE candidate", { type });
      const iceCandidate = new RTCIceCandidate(candidate);
      if (type === "sender") {
        await receivingPc?.addIceCandidate(iceCandidate);
      } else {
        await sendingPc?.addIceCandidate(iceCandidate);
      }
    });

    setSocket(socket);

    return () => {
      socket.disconnect();
      sendingPc?.close();
      receivingPc?.close();
    };
  }, [name, localAudioTrack, localVideoTrack]);

  useEffect(() => {
    if (localVideoRef.current && localVideoTrack) {
      const stream = new MediaStream([localVideoTrack]);
      localVideoRef.current.srcObject = stream;
      localVideoRef.current
        .play()
        .catch((e) => console.error("Error playing local video:", e));
    }
  }, [localVideoRef, localVideoTrack]);

  useEffect(() => {
    if (remoteVideoRef.current && (remoteVideoTrack || remoteAudioTrack)) {
      const stream = new MediaStream();
      if (remoteVideoTrack) stream.addTrack(remoteVideoTrack);
      if (remoteAudioTrack) stream.addTrack(remoteAudioTrack);
      remoteVideoRef.current.srcObject = stream;
      remoteVideoRef.current
        .play()
        .catch((e) => console.error("Error playing remote video:", e));
    }
  }, [remoteVideoRef, remoteVideoTrack, remoteAudioTrack]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 space-y-6">
      <div className="text-lg font-semibold text-gray-700 mb-4">Hi {name}</div>
      <video
        className="rounded-lg shadow-lg"
        autoPlay
        playsInline
        muted
        width={400}
        height={400}
        ref={localVideoRef}
      />
      {lobby ? (
        <div className="text-gray-500 italic mt-4">
          Waiting to connect you to someone
        </div>
      ) : null}
      <video
        className="rounded-lg shadow-lg"
        autoPlay
        playsInline
        width={400}
        height={400}
        ref={remoteVideoRef}
      />
    </div>
  );
};
