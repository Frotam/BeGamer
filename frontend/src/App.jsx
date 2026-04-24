import './assets/css/index.css'
import {
  RouterProvider,
  createBrowserRouter,
} from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "bootstrap-icons/font/bootstrap-icons.css";

import Home from "./Main/Home";
import Room from "./Main/Room";
import { FirebaseProvider } from "./context/Firebase";
import { ToastProvider } from "./context/Toast";
import { SocketProvider } from './context/Socketcontext';

import "./components/Editor/EditorLayout.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/rooms/:roomid",
    element: <Room />,
  },
]);

function App() {
  return (
    <MantineProvider>
      <ToastProvider>
        <SocketProvider>
          <FirebaseProvider>
            <RouterProvider router={router} />
          </FirebaseProvider>
        </SocketProvider>
      </ToastProvider>
    </MantineProvider>
  );
}

export default App;
