import { useEffect } from "react";
import { AppLayout } from "../layouts/AppLayout";
import { ChatProvider } from "../providers/ChatProvider";
import { WalletProvider, useWallet } from "../providers/WalletProvider";
import { ChatsPage } from "../pages/ChatsPage";
import { ContactsPage } from "../pages/ContactsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { SignInPage } from "../pages/SignInPage";
import { navigate, useHashRoute } from "../router";

function RoutedApp() {
  const route = useHashRoute();
  const { session } = useWallet();

  useEffect(() => {
    if (!session && route.name !== "signin") navigate("/signin");
    if (session && route.name === "signin") navigate("/chats");
  }, [session, route]);

  if (!session) return <SignInPage />;

  return (
    <ChatProvider>
      <AppLayout route={route}>
        {route.name === "contacts" ? <ContactsPage /> : null}
        {route.name === "settings" ? <SettingsPage /> : null}
        {route.name === "chats" ? <ChatsPage /> : null}
        {route.name === "chat" ? <ChatsPage peer={route.peer} /> : null}
      </AppLayout>
    </ChatProvider>
  );
}

export function App() {
  return (
    <WalletProvider>
      <RoutedApp />
    </WalletProvider>
  );
}
