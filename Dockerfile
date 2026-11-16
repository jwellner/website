FROM node:24 AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
ARG VERSION=dev
ARG COMMIT=
RUN VERSION=$VERSION COMMIT=$COMMIT yarn build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
# Rendered by the nginx entrypoint: it fills in ${NGINX_LOCAL_RESOLVERS} from /etc/resolv.conf
# (needed for the /count proxy) and leaves nginx's own $variables alone.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 NGINX_ENVSUBST_FILTER=^NGINX_
COPY ./docker/default.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
