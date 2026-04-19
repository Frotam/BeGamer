import './assets/css/index.css'
import {
  Outlet,
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
import "./components/Editor/EditorLayout.css";





function FirebaseRouteShell() {
  return (
    <FirebaseProvider>
      <Outlet />
    </FirebaseProvider>
  );
}
console.log(`
$$$$$$$\\                            $$\\      $$\\            $$$$$$\\  $$\\           
$$  __$$\\                           $$$\\    $$$ |          $$  __$$\\ \\__|          
$$ |  $$ | $$$$$$\\  $$$$$$$\\        $$$$\\  $$$$ | $$$$$$\\  $$ /  \\__|$$\\  $$$$$$\\  
$$ |  $$ |$$  __$$\\ $$  __$$\\       $$\\$$\\$$ $$ | \\____$$\\ $$$$\\     $$ | \\____$$\\ 
$$ |  $$ |$$ /  $$ |$$ |  $$ |      $$ \\$$$  $$ | $$$$$$$ |$$  _|    $$ | $$$$$$$ |
$$ |  $$ |$$ |  $$ |$$ |  $$ |      $$ |\\$  /$$ |$$  __$$ |$$ |      $$ |$$  __$$ |
$$$$$$$  |\\$$$$$$  |$$ |  $$ |      $$ | \\_/ $$ |\\$$$$$$$ |$$ |      $$ |\\$$$$$$$ |
\\_______/  \\______/ \\__|  \\__|      \\__|     \\__| \\_______|\\__|      \\__| \\_______|
`);
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
