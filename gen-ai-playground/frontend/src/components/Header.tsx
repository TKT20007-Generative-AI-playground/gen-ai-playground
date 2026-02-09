import { Link } from "react-router-dom"
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import LoginModal from './Login';

export default function Header() {
  const [loginOpened, setLoginOpened] = useState(false);
  const { isLoggedIn, logout } = useAuth();

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #ccc', marginBottom: '20px' }}>
        <Link to="/">Image Generator</Link>

        {isLoggedIn ? (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              logout();
            }}
          >
            Logout
          </a>
        ) : (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setLoginOpened(true);
            }}
          >
            Login
          </a>
        )}
      </div>

      <LoginModal opened={loginOpened} onClose={() => setLoginOpened(false)} />
    </>
  );
}
