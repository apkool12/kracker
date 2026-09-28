// src/lib/socket.ts
import { io } from "socket.io-client";

// 서버 주소는 필요에 따라 .env로 뺄 수 있음
export const socket = io(import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4000", {
  transports: ["websocket"],
});

// 공용 타입(서버 ack 형태에 맞춤)
export type RoomStatus = "waiting" | "playing";
export interface PlayerSummary {
  id: string;
  nickname: string;
  team?: "A" | "B";
  color?: string;
  ready: boolean;
}
export interface SafeRoomState {
  roomId: string;
  hostId: string;
  max: number;
  status: RoomStatus;
  players: PlayerSummary[];
}
export interface AckOk<T = unknown> {
  ok: true;
  room?: SafeRoomState;
  data?: T;
}
export interface AckErr {
  ok: false;
  error?: string;
}
export type Ack<T = unknown> = AckOk<T> | AckErr;
