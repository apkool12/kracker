import { useState, useEffect } from "react";
import NicknameModal from "./components/modals/NicknameModal";
import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";
import "./App.css";
import Home from "./pages/Home";
import GameLobby from "./pages/GameLobby";
import Game from "./components/RoundsGame";
import { BgmProvider } from "./providers/BgmProvider";

function App() {
  const [showModal, setShowModal] = useState(false);

  // 페이지 로드 시 닉네임 확인
  useEffect(() => {
    // 홈에서는 닉네임 확인용으로 항상, 로비/게임 화면에서는 닉네임이 없을 때만 띄운다
    const savedNickname = localStorage.getItem("userNickname");
    setShowModal(!savedNickname || window.location.pathname === "/");
  }, []);
  return (
    <BrowserRouter>
      <BgmProvider>
        <div>
          <NicknameModal
            isOpen={showModal}
            onSubmit={(nickname) => {
              console.log("닉네임:", nickname);
              setShowModal(false);
            }}
          />
        </div>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lobby" element={<GameLobby />} />
          <Route path="/game" element={<Game />} />
        </Routes>
      </BgmProvider>
    </BrowserRouter>
  );
}

export default App;
