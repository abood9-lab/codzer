import type { MetaFunction } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';
import { ProjectsPage } from '~/components/projects/ProjectsPage';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';

export const meta: MetaFunction = () => {
  return [
    { title: 'My Projects — Codzer' },
    { name: 'description', content: 'Create, save and reopen your Codzer projects in the cloud.' },
  ];
};

export default function Projects() {
  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <ClientOnly fallback={<div className="flex-1" />}>{() => <ProjectsPage />}</ClientOnly>
    </div>
  );
}
