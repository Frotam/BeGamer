import "./App.css";
import { useState } from "react";
import {
  Outlet,
  RouterProvider,
  createBrowserRouter,
  Link,
} from "react-router-dom";
import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import Home from "./Home";
import Test from "./Test";
import Room from "./Room";
import RoleRevealPage from "./components/RoleRevealPage";
import SkyBackground from "./components/SkyBackground";
import { FirebaseProvider } from "./context/Firebase";
import { ToastProvider } from "./context/Toast";
import "./components/Editor/EditorLayout.css";





function FirebaseRouteShell() {
  return (
    <FirebaseProvider>
      <Outlet />
    </FirebaseProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <FirebaseRouteShell />,
    children: [
      {
        path: "/",
        element: <Home />,
      },
    
      {
        path: "/rooms/:roomid",
        element: <Room />,
      },
    ],
  },
  
]);

function App() {
  return (
    <MantineProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </MantineProvider>
  );
}

export default App;
