/* eslint-disable no-unused-vars */
import { Request, RequestHandler } from 'express';
import { Application } from 'express';
import { DocumentNode } from 'graphql';
import { PubSub } from 'graphql-subscriptions';
import { castArray, map, merge, union, without } from 'lodash';

const combine = (features: IArguments, extractor: (x: Feature) => any): any[] =>
  without(union(...map(features, res => castArray(extractor(res)))), undefined);

type CreateResolversFunc = (pubsub: any) => any;
type CreateContextFunc = (req: Request, connectionParams?: object | (() => object), webSocket?: any) => object;
type MiddlewareFunc = (app: Application) => any;

interface FeatureParams {
  schema?: DocumentNode | DocumentNode[];
  createResolversFunc?: CreateResolversFunc | CreateResolversFunc[];
  createContextFunc?: CreateContextFunc | CreateContextFunc[];
  middleware?: MiddlewareFunc | MiddlewareFunc[];
}

class Feature {
  public schema: DocumentNode[];
  public createResolversFunc: CreateResolversFunc[];
  public createContextFunc: CreateContextFunc[];
  public middleware: MiddlewareFunc[];

  constructor(feature?: FeatureParams, ...features: Feature[]) {
    this.schema = combine(arguments, arg => arg.schema);
    this.createResolversFunc = combine(arguments, arg => arg.createResolversFunc);
    this.createContextFunc = combine(arguments, arg => arg.createContextFunc);
    this.middleware = combine(arguments, arg => arg.middleware);
  }

  get schemas(): DocumentNode[] {
    return this.schema;
  }

  public async createContext(req: Request, connectionParams?: object | (() => object), webSocket?: any) {
    const results = await Promise.all(
      this.createContextFunc.map(createContext => createContext(req, connectionParams, webSocket))
    );
    return merge({}, ...results);
  }

  public createResolvers(pubsub: any): any {
    return merge({}, ...this.createResolversFunc.map(createResolvers => createResolvers(pubsub)));
  }

  get middlewares(): MiddlewareFunc[] {
    return this.middleware;
  }
}

export default Feature;