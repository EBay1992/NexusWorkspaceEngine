import { JoinPageClient } from './join-page-client';

interface JoinPageProps {
  params: Promise<{ workspaceId: string; role: string; token: string }>;
}

export default async function JoinPage({ params }: JoinPageProps) {
  const { workspaceId, role, token } = await params;
  return (
    <JoinPageClient
      workspaceId={decodeURIComponent(workspaceId)}
      role={decodeURIComponent(role)}
      token={decodeURIComponent(token)}
    />
  );
}
