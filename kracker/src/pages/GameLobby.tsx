// src/pages/GameLobby.tsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styled from "styled-components";

import BgBase from "../assets/images/titleBackground.svg";

import { RoomSummary } from "../types/gameRoom";
import BackButton from "../components/buttons/BackButton";
import ActionButton from "../components/buttons/ActionButton";
import PlayerCard from "../components/cards/PlayerCard";
import ColorSelectModal from "../components/modals/ColorSelectModal";
import LoadingModal from "../components/modals/LoadingModal";
import { socket } from "./../lib/socket";

const toCssHex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

type Player = { id: string; team: number; name: string; color: string; accessory?: string };

interface GameLobbyProps {
  roomCode?: string;
  onExit?: () => void;
}

const GameLobby: React.FC<GameLobbyProps> = ({ roomCode = "", onExit }) => {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { room?: RoomSummary } };

  const [selected, setSelected] = useState<Player | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);

  const [loadingModalOpen, setLoadingModalOpen] = useState(false);


  const [room, setRoom] = useState<RoomSummary | null>(
    location.state?.room ?? null
  );

  const DEFAULT_SKIN = "#888888";

  const [myId, setMyId] = useState<string | null>(socket.id ?? null);
  const [leaving, setLeaving] = useState(false);

  // ★ 연결 상태 추가
  const [isConnected, setIsConnected] = useState(socket.connected);

  const getSavedNickname = () =>
    (localStorage.getItem("userNickname") || "").trim();

  const isMe = (pid: string | null | undefined) => !!pid && pid === myId;

  const [players, setPlayers] = useState<Player[]>(
    () =>
      (location.state?.room as any)?.players?.map((p: any) => ({
        id: String(p.id),
        team: typeof p.team === "number" ? p.team : 1,
        name: p.nickname ?? p.name ?? "Player",
        color:
          typeof p.color === "string" && p.color.length > 0
            ? p.color
            : DEFAULT_SKIN,
      })) ?? []
  );

  const normalizeHex = (s: string) => {
    const t = s.startsWith("#") ? s.slice(1) : s;
    return `#${t.toUpperCase()}`;
  };

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 0);
    return () => clearTimeout(t);
  }, []);

  // ★ 홈으로 이동하는 함수 (중복 방지)
  const goHome = useCallback(() => {
    sessionStorage.removeItem("room:last");
    setExiting(true);
    setTimeout(() => navigate("/"), 260);
  }, [navigate]);

  const handleColorConfirm = (next: Player) => {
    if (!room?.roomId) return;

    // 장신구가 바뀌었으면 서버에 반영 (색과 독립)
    const prevAcc = players.find((p) => p.id === next.id)?.accessory ?? "none";
    if ((next.accessory ?? "none") !== prevAcc) {
      setPlayers((prev) =>
        prev.map((p) => (p.id === next.id ? { ...p, accessory: next.accessory } : p))
      );
      socket.emit("player:setAccessory", { accessory: next.accessory ?? "none" }, (res: any) => {
        if (!res?.ok) fetchRoomInfo();
      });
    }

    const hex = normalizeHex(next.color);
    setPlayers((prev) =>
      prev.map((p) => (p.id === next.id ? { ...p, color: hex } : p))
    );

    socket.emit(
      "player:setColor",
      { roomId: room.roomId, color: hex },
      (res: any) => {
        if (!res?.ok) {
          fetchRoomInfo();
          alert(
            res?.error === "COLOR_TAKEN"
              ? "이미 사용 중인 색입니다."
              : res?.error === "INVALID_COLOR"
              ? "잘못된 색 형식입니다. (#RRGGBB)"
              : "색 변경에 실패했습니다."
          );
        } else {
          fetchRoomInfo();
        }
      }
    );
  };

  const normalizePlayer = useCallback((p: any): Player => {
    const toNumTeam = (t: any) => {
      if (typeof t === "number") return t;
      if (t === "A") return 1;
      if (t === "B") return 2;
      return 1;
    };
    return {
      id: String(p.id),
      team: toNumTeam(p.team),
      name: p.nickname ?? p.name ?? "Player",
      color:
        typeof p.color === "string" && p.color.length > 0
          ? p.color
          : DEFAULT_SKIN,
      accessory: typeof p.accessory === "string" ? p.accessory : "none",
    };
  }, []);

  const isTeamMode = room?.gameMode ? room.gameMode === "팀전" : true;
  const NUM_TEAMS = isTeamMode ? 2 : 0;
  const TEAM_CAP = 3;

  const codeToShow = room?.roomId ?? roomCode;

  const teamCounts = useMemo(() => {
    const acc: Record<number, number> = {};
    for (const p of players) acc[p.team] = (acc[p.team] ?? 0) + 1;
    return acc;
  }, [players]);

  const overCapacity =
    isTeamMode && Object.values(teamCounts).some((c) => c > TEAM_CAP);

  const allColored =
    players.length > 0 &&
    players.every(
      (p) =>
        typeof p.color === "string" &&
        p.color.length > 0 &&
        p.color !== DEFAULT_SKIN
    );

  const fetchRoomInfo = useCallback(() => {
    const id = room?.roomId;
    if (!id) return;
    socket.emit("room:info", { roomId: id }, (res: any) => {
      if (res?.ok && res.room) {
        setRoom((prev) => ({ ...(prev ?? {}), ...res.room }));
        setPlayers((res.room.players ?? []).map(normalizePlayer));
      }
    });
  }, [room?.roomId, normalizePlayer]);

  // ★ 소켓 연결/재연결/끊김 시 내 id 동기화 + 연결 상태 업데이트
  useEffect(() => {
    const onConnectLike = () => {
      setMyId(socket.id ?? null);
      setIsConnected(true);
    };
    const onDisconnect = () => {
      setMyId(null);
      setIsConnected(false);
    };

    socket.on("connect", onConnectLike);
    socket.on("reconnect", onConnectLike as any);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnectLike);
      socket.off("reconnect", onConnectLike as any);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  // ★ 연결이 끊어지면 즉시 홈으로 이동
  useEffect(() => {
    if (!isConnected && !leaving) {
      goHome();
    }
  }, [isConnected, leaving, goHome]);

  // ★ 페이지를 떠날 때 (새로고침, 창 닫기 등) 방 떠나기 처리
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (room?.roomId) {
        socket.emit("room:leave", {});
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [room?.roomId]);

  useEffect(() => {
    if (!room?.roomId || !myId) return;
    const nick = getSavedNickname();
    if (!nick) return;

    const me = players.find((p) => p.id === myId);
    if (!me || me.name === nick) return;

    socket.emit(
      "player:setNickname",
      { roomId: room.roomId, nickname: nick },
      (res: any) => {
        if (res?.ok) fetchRoomInfo();
      }
    );
  }, [room?.roomId, myId, players, fetchRoomInfo]);

  const applyPlayerChange = (next: Player) => {
    setPlayers((prev) => prev.map((p) => (p.id === next.id ? next : p)));
  };

  const openColorPicker = (p: Player) => {
    setSelected(p);
    setModalOpen(true);
  };

  const team1Players = useMemo(
    () => (NUM_TEAMS >= 2 ? players.filter((p) => p.team === 1) : players),
    [players, NUM_TEAMS]
  );
  const team2Players = useMemo(
    () => (NUM_TEAMS >= 2 ? players.filter((p) => p.team === 2) : []),
    [players, NUM_TEAMS]
  );

  useEffect(() => {
    if (!room) {
      const cached = sessionStorage.getItem("room:last");
      if (cached) {
        try {
          setRoom(JSON.parse(cached));
        } catch {}
      }
    } else {
      sessionStorage.setItem("room:last", JSON.stringify(room));
    }
  }, [room]);

  // 소켓 핸들러에서 최신 players 를 읽기 위한 ref (effect 의존성에 넣으면 room:info 무한 루프)
  const playersRef = useRef(players);
  playersRef.current = players;

  // ★ 이벤트 수신 시 '내가 나간 상태'를 즉시 반영
  useEffect(() => {
    if (!room?.roomId) return;

    fetchRoomInfo();

    const onUpdate = (payload: any) => {
      const list = payload?.players ?? payload?.room?.players;
      if (list) {
        setPlayers(list.map(normalizePlayer));
        // 서버 리스트에 내가 없으면 이미 방 밖 → 즉시 이동
        if (myId && !list.some((p: any) => String(p.id) === myId)) {
          goHome();
        }
      }
    };

    const onPlayerJoined = () => fetchRoomInfo();

    const onPlayerLeft = (payload: { id: string }) => {
      // 내가 나갔다고 서버가 알려주면 즉시 이동
      if (payload?.id && myId && String(payload.id) === String(myId)) {
        goHome();
      } else {
        fetchRoomInfo();
      }
    };

    // ★ 게임 시작 이벤트 수신
    // GameLobby.tsx에서 useEffect로 감싸서 추가
    const onGameStart = (gameData: any) => {
      try {
        if (!room?.roomId || !myId) {
          console.error("❌ 방 정보 또는 내 ID가 없음");
          return;
        }

        const gameState = {
          players: playersRef.current.map((p) => ({
            id: p.id,
            name: p.name,
            team: p.team,
            color: p.color,
            accessory: p.accessory,
            isMe: p.id === myId,
          })),
          room: {
            roomId: room.roomId,
            gameMode: room.gameMode || "일반",
            roomName: room.roomName,
          },
          myPlayerId: myId,
          startTime: gameData.startTime || Date.now(),
          // 🔢 서버에서 내려온 초기 스폰 계획 전달
          spawnPlan: gameData.spawnPlan || undefined,
          // 🗺️ 서버가 내려온 초기 스폰 좌표 전달
          spawnPositions: gameData.spawnPositions || undefined,
        };

        sessionStorage.setItem("gameState", JSON.stringify(gameState));

        setExiting(true);
        setTimeout(() => {
          navigate("/game", {
            state: gameState,
            replace: true,
          });
        }, 260);
      } catch (error) {
        console.error("❌ 게임 시작 처리 중 오류:", error);
        alert("게임 시작 중 오류가 발생했습니다.");
      }
    };

    // 이벤트 리스너 등록
    socket.on("room:update", onUpdate);
    socket.on("player:joined", onPlayerJoined);
    socket.on("player:left", onPlayerLeft);
    socket.on("game:started", onGameStart); // ⭐ 여기에 추가 (game:start가 아니라 game:started)

    return () => {
      socket.off("room:update", onUpdate);
      socket.off("player:joined", onPlayerJoined);
      socket.off("player:left", onPlayerLeft);
      socket.off("game:started", onGameStart); // ⭐ 정리도 추가
    };
  }, [
    room?.roomId,
    myId,
    navigate,
  ]);

  const handleTeamChange = (id: string, nextTeam: number) => {
    if (NUM_TEAMS < 2) return;
    if (id !== myId) return;

    const me = players.find((p) => p.id === id);
    if (!me) return;

    if (me.team === nextTeam) return;

    const nextCount = players.filter((p) => p.team === nextTeam).length ?? 0;
    if (nextCount >= TEAM_CAP) {
      alert(`${nextTeam}팀은 최대 ${TEAM_CAP}명까지 가능합니다.`);
      return;
    }

    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, team: nextTeam } : p))
    );

    socket.emit("player:setTeam", {
      roomId: room?.roomId,
      playerId: id,
      team: nextTeam === 1 ? "A" : "B",
    });
  };

  // ★ 나가기: 즉시 화면에서 제거 + ACK 지연시에도 이동 보장
  const handleExit = () => {
    if (leaving) return;
    setLeaving(true);

    if (myId) setPlayers((prev) => prev.filter((p) => p.id !== myId));
    sessionStorage.removeItem("room:last");

    let navigated = false;
    const goHomeOnce = () => {
      if (!navigated) {
        navigated = true;
        navigate("/");
      }
    };

    socket.emit("room:leave", {}, () => {
      goHomeOnce();
    });

    // ACK 안 오더라도 UX 보장
    setTimeout(goHomeOnce, 800);
  };

  useEffect(() => {
    const onClosed = () => {
      alert("방이 종료되었습니다.");
      sessionStorage.removeItem("room:last");
      navigate("/");
    };
    socket.on("room:closed", onClosed);
    return () => {
      socket.off("room:closed", onClosed);
    };
  }, [navigate]);

  // ★ 게임 시작 핸들러 수정
  const handleGameStart = () => {
    if (!room?.roomId) {
      alert("방 정보를 찾을 수 없습니다.");
      return;
    }

    // 호스트만 게임을 시작할 수 있는지 확인
    const hostPlayer = players.find((p) => p.id === room.hostId);
    if (myId !== room.hostId) {
      alert("방장만 게임을 시작할 수 있습니다.");
      return;
    }

    if (isDisabled) {
      if (overCapacity) {
        alert("팀 인원이 초과되었습니다. 팀을 재조정해주세요.");
      } else if (!allColored) {
        alert("모든 플레이어가 색상을 선택해야 합니다.");
      }
      return;
    }

    // 로딩 모달 열기
    setLoadingModalOpen(true);

    socket.emit("game:start", {}, (response: any) => {
      if (!response?.ok) {
        const errorMessages: { [key: string]: string } = {
          NOT_HOST: "방장만 게임을 시작할 수 있습니다.",
          COLOR_NOT_READY: "모든 플레이어가 색상을 선택해야 합니다.",
          NO_ROOM: "방을 찾을 수 없습니다.",
          NOT_ENOUGH_PLAYERS: "2명 이상이어야 시작할 수 있습니다.",
          IN_PROGRESS: "이미 게임이 진행 중입니다.",
        };

        const errorMsg =
          errorMessages[response?.error] || "게임 시작에 실패했습니다.";
        alert(errorMsg);
        console.error("❌ 게임 시작 실패:", response);
        setLoadingModalOpen(false); // 실패 시 모달 닫기
      }
    });

  };

  const isDisabled = overCapacity || !allColored;

  const blockedColors = useMemo(
    () =>
      players
        .map((p) => p.color)
        .filter((c): c is string => typeof c === "string" && c.length > 0),
    [players]
  );

  // ★ 연결이 끊어진 상태에서는 로딩 화면 표시
  if (!isConnected) {
    return (
      <Wrap>
        <DisconnectedOverlay>
          <DisconnectedMessage>
            연결이 끊어졌습니다.
            <br />
            홈으로 이동합니다...
          </DisconnectedMessage>
        </DisconnectedOverlay>
      </Wrap>
    );
  }

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#000000",
          zIndex: 9999,
          opacity: exiting ? 1 : 0,
          transition: "opacity 260ms ease",
          pointerEvents: exiting ? "auto" : "none",
        }}
      />
      <Wrap style={{
        opacity: entered && !exiting ? 1 : 0,
        transition: 'opacity 260ms ease',
      }}>
        <TitleSection>
          <TextBackButton onClick={handleExit} aria-label="나가기">
            나가기
          </TextBackButton>

          <TitleBox>
            <Label>방 코드</Label>
            <Code>{codeToShow}</Code>
          </TitleBox>
        </TitleSection>

        {modalOpen && (
          <ColorSelectModal
            open={modalOpen}
            player={selected}
            numTeams={NUM_TEAMS}
            onClose={() => setModalOpen(false)}
            onConfirm={handleColorConfirm}
            blockedColors={
              selected
                ? blockedColors.filter((c) => c !== selected.color)
                : blockedColors
            }
          />
        )}

        <OuterCard>
          {NUM_TEAMS >= 2 ? (
            <>
              <SlotGrid>
                {team1Players.map((p) => (
                  <PlayerCard
                    key={p.id}
                    name={p.name}
                    playerAccessory={p.accessory}
                    team={p.team}
                    numTeams={NUM_TEAMS}
                    editable={p.id === myId}
                    onTeamChange={
                      p.id === myId ? (n) => handleTeamChange(p.id, n) : undefined
                    }
                    onCardClick={
                      p.id === myId ? () => openColorPicker(p) : undefined
                    }
                    playerColor={p.color}
                  />
                ))}
              </SlotGrid>

              <InnerDivider />

              <SlotGrid>
                {team2Players.map((p) => (
                  <PlayerCard
                    key={p.id}
                    name={p.name}
                    playerAccessory={p.accessory}
                    team={p.team}
                    numTeams={NUM_TEAMS}
                    editable={p.id === myId}
                    onTeamChange={
                      p.id === myId ? (n) => handleTeamChange(p.id, n) : undefined
                    }
                    onCardClick={
                      p.id === myId ? () => openColorPicker(p) : undefined
                    }
                    playerColor={p.color}
                  />
                ))}
              </SlotGrid>
            </>
          ) : (
            <>
              <SlotGrid>
                {players.slice(0, 3).map((p) => (
                  <PlayerCard
                    key={p.id}
                    name={p.name}
                    playerAccessory={p.accessory}
                    team={p.team}
                    numTeams={NUM_TEAMS}
                    editable={p.id === myId}
                    onTeamChange={
                      p.id === myId ? (n) => handleTeamChange(p.id, n) : undefined
                    }
                    onCardClick={
                      p.id === myId ? () => openColorPicker(p) : undefined
                    }
                    playerColor={p.color}
                  />
                ))}
              </SlotGrid>

              <InnerDivider />

              <SlotGrid>
                {players.slice(3, 6).map((p) => (
                  <PlayerCard
                    key={p.id}
                    name={p.name}
                    playerAccessory={p.accessory}
                    team={p.team}
                    numTeams={NUM_TEAMS}
                    editable={p.id === myId}
                    onTeamChange={
                      p.id === myId ? (n) => handleTeamChange(p.id, n) : undefined
                    }
                    onCardClick={
                      p.id === myId ? () => openColorPicker(p) : undefined
                    }
                    playerColor={p.color}
                  />
                ))}
              </SlotGrid>
            </>
          )}
        </OuterCard>

        <ActionButton
          disabled={isDisabled}
          onClick={handleGameStart}
          style={{
            opacity: isDisabled ? 0.45 : 1,
            color: isDisabled ? "#8f8f8f" : "#ffffff",
            cursor: isDisabled ? "not-allowed" : "pointer",
          }}
        >
          시작하기
        </ActionButton>

        {/* 로딩 모달 */}
        <LoadingModal
          isOpen={loadingModalOpen}
          currentPlayers={players.length}
          expectedPlayers={6} // 기본값
          roomName={room?.roomName || "Unknown Room"}
        />
      </Wrap>
    </>
  );
};

export default GameLobby;

/* ================= styles ================ */

const Wrap = styled.main`
  min-height: 100vh;
  background: #090731;
  display: flex;
  flex-direction: column;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background: url(${BgBase}) center/cover no-repeat;
    opacity: 0.1;
    pointer-events: none;
  }
`;

// ★ 연결 끊김 오버레이 스타일 추가
const DisconnectedOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(9, 7, 49, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
`;

const DisconnectedMessage = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 16px;
  padding: 40px;
  text-align: center;
  font-size: 24px;
  font-weight: 300;
  color: #fff;
  line-height: 1.5;
`;

const TitleSection = styled.header`
  position: relative;
  display: grid;
  place-items: center;
  min-height: 120px;
  padding: 10px clamp(24px, 5vw, 64px);
`;

const TextBackButton = styled(BackButton)`
  position: absolute;
  left: clamp(24px, 5vw, 64px);
  top: 50%;
  transform: translateY(-50%);
  width: 175px;
  height: 60px;
  align-items: center;
  justify-content: flex-start;
  padding: 0;
  margin-left: 80px;
  background: transparent;
  border: none;
  border-radius: 0;
  cursor: pointer;
  color: #8f8f8f;
  font-family: "Apple SD Gothic Neo", sans-serif;
  font-size: 40px;
  font-weight: 300;
  letter-spacing: -0.2px;
  &:hover {
    color: #fff;
  }
  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.45);
    border-radius: 8px;
  }
`;

const TitleBox = styled.div`
  display: grid;
  justify-items: center;
  row-gap: 8px;
`;

const Label = styled.span`
  font-size: 32px;
  font-weight: 300;
  margin: 20px 0 -10px;
  color: rgba(255, 255, 255, 0.85);
`;

const Code = styled.h2`
  margin: 0 0 10px 0;
  font-weight: 900;
  letter-spacing: 2px;
  color: #fff;
  font-size: 80px;
  line-height: 1;
`;

const OuterCard = styled.section`
  width: max(700px, min(69.0625vw, 1326px));
  margin: -10px auto 20px;
  padding: clamp(24px, 4vh, 40px) clamp(24px, 4vw, 44px);
  background: rgba(255, 255, 255, 0.08);
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-radius: 36px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
`;

const SlotGrid = styled.div`
  display: grid;
  justify-items: center;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(60px, 2.6vw, 60px);
  padding: 8px 0;
`;

const InnerDivider = styled.hr`
  margin: clamp(20px, 3vh, 36px) 100px;
  border: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.35);
`;
