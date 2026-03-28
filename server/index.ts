import { router } from './trpc';
import { projectRouter } from './routers/project';
import { sceneRouter } from './routers/scene';
import { userRouter } from './routers/user';
import { pipelineRouter } from './routers/pipeline';

export const appRouter = router({
  project: projectRouter,
  scene: sceneRouter,
  user: userRouter,
  pipeline: pipelineRouter,
});

export type AppRouter = typeof appRouter;
