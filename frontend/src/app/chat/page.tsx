import { Suspense } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { ChatView } from '../../components/chat/ChatView';

export default function ChatPage() {
  return (
    <AppShell>
      <Suspense>
        <ChatView />
      </Suspense>
    </AppShell>
  );
}
