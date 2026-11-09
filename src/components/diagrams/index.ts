import type { ComponentType } from 'react';
import type { DiagramId } from '../../types';
import { HeapStack, BlockingVsNonBlocking, Cluster, ModuleResolution, NodeArchitecture, ThreadPool } from './architecture';
import { JwtFlow, OAuthFlow } from './auth';
import { CacheAside, ConnectionPool, QueueWorker } from './data';
import { EventLoopPhases, EventLoopSimulator } from './eventLoop';
import { LayeredArchitecture, MiddlewarePipeline, RequestResponse, StreamPipeline } from './http';
import { CiCdPipeline, Microservices, ReverseProxy } from './infra';

/** Registry: diagram id → component. Every DiagramId has a component. */
export const diagrams: Record<DiagramId, ComponentType> = {
  'node-architecture': NodeArchitecture,
  'event-loop-phases': EventLoopPhases,
  'event-loop-simulator': EventLoopSimulator,
  'blocking-vs-nonblocking': BlockingVsNonBlocking,
  'thread-pool': ThreadPool,
  'module-resolution': ModuleResolution,
  'request-response': RequestResponse,
  'middleware-pipeline': MiddlewarePipeline,
  'layered-architecture': LayeredArchitecture,
  'stream-pipeline': StreamPipeline,
  'connection-pool': ConnectionPool,
  'jwt-flow': JwtFlow,
  'oauth-flow': OAuthFlow,
  cluster: Cluster,
  'heap-stack': HeapStack,
  'cache-aside': CacheAside,
  'queue-worker': QueueWorker,
  'reverse-proxy': ReverseProxy,
  'ci-cd-pipeline': CiCdPipeline,
  microservices: Microservices,
};
