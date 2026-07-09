import { WorkspacePageClient } from './workspace-page-client';

interface WorkspacePageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { id } = await params;
  return <WorkspacePageClient workspaceId={id} />;
}
