import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { createApolloFetch } from 'apollo-fetch';
import { ApolloLink } from 'apollo-link';
import { BatchHttpLink } from 'apollo-link-batch-http';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { ApolloProvider, getDataFromTree } from 'react-apollo';
import { Provider } from 'react-redux';
import { StaticRouter } from 'react-router';
import { ServerStyleSheet } from 'styled-components';
import { LoggingLink } from 'apollo-logger';
// import { addPersistedQueries } from 'persistgraphql';
import fs from 'fs';
import path from 'path';
import Helmet from 'react-helmet';
import url from 'url';
import { CookiesProvider } from 'react-cookie';

import createApolloClient from '../../common/createApolloClient';
import createReduxStore from '../../common/createReduxStore';
import Html from './html';
import Routes from '../../client/app/Routes';
import log from '../../common/log';
import modules from '../modules';
import { options as spinConfig } from '../../../.spinrc.json';
import settings from '../../../settings';

let assetMap;

const { protocol, hostname, port, pathname } = url.parse(__BACKEND_URL__);
const apiUrl = `${protocol}//${hostname}:${process.env.PORT || port}${pathname}`;

async function renderServerSide(req, res) {
  // if (__PERSIST_GQL__) {
  //   networkInterface = addPersistedQueries(networkInterface, queryMap);
  // }
  //

  const fetch = createApolloFetch({ uri: apiUrl, constructOptions: modules.constructFetchOptions });
  fetch.batchUse(({ options }, next) => {
    try {
      options.credentials = 'include';
      options.headers = req.headers;
    } catch (e) {
      console.error(e);
    }

    next();
  });
  const cache = new InMemoryCache();

  let link = new BatchHttpLink({ fetch });

  const client = createApolloClient({
    link: ApolloLink.from((settings.app.logging.apolloLogging ? [new LoggingLink()] : []).concat([link])),
    cache
  });

  let initialState = {};
  const store = createReduxStore(initialState, client);

  const context = {};
  const component = (
    <CookiesProvider cookies={req.universalCookies}>
      <Provider store={store}>
        <ApolloProvider client={client}>
          <StaticRouter location={req.url} context={context}>
            {Routes}
          </StaticRouter>
        </ApolloProvider>
      </Provider>
    </CookiesProvider>
  );

  await getDataFromTree(component);

  res.status(200);

  const sheet = new ServerStyleSheet();
  const html = ReactDOMServer.renderToString(sheet.collectStyles(component));
  const css = sheet.getStyleElement();
  const helmet = Helmet.renderStatic(); // Avoid memory leak while tracking mounted instances

  if (context.url) {
    res.writeHead(301, { Location: context.url });
    res.end();
  } else {
    if (__DEV__ || !assetMap) {
      assetMap = JSON.parse(fs.readFileSync(path.join(spinConfig.frontendBuildDir, 'web', 'assets.json')));
    }

    const apolloState = Object.assign({}, cache.extract());

    const token = req.universalCookies.get('x-token') ? req.universalCookies.get('x-token') : null;
    const refreshToken = req.universalCookies.get('x-refresh-token')
      ? req.universalCookies.get('x-refresh-token')
      : null;

    const page = (
      <Html
        content={html}
        state={apolloState}
        assetMap={assetMap}
        css={css}
        helmet={helmet}
        token={token}
        refreshToken={refreshToken}
      />
    );
    res.send(`<!doctype html>\n${ReactDOMServer.renderToStaticMarkup(page)}`);
    res.end();
  }
}

export default queryMap => async (req, res, next) => {
  try {
    if (req.url.indexOf('.') < 0 && __SSR__) {
      return renderServerSide(req, res, queryMap);
    } else {
      return next();
    }
  } catch (e) {
    log.error('RENDERING ERROR:', e);
  }
};
