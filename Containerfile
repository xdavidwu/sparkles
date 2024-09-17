FROM public.ecr.aws/docker/library/alpine:3.20 as builder
ARG SPARKLES_ENV=.env.apiserver-proxy
ARG SPARKLES_BASE=/

WORKDIR /workspace
RUN apk add go npm git gzip # brotli
COPY go.mod go.sum .
RUN go mod download
COPY package.json package-lock.json .
RUN npm ci
COPY . .
RUN cp "$SPARKLES_ENV" .env
RUN npm run build
RUN find dist -type f \( -name '*.css' -or -name '*.js' -or -name '*.wasm' \) -exec gzip -9k {} \;
# RUN find dist -type f \( -name '*.css' -or -name '*.js' -or -name '*.wasm' \) -exec brotli -k -q 11 {} \;
RUN [ "$SPARKLES_BASE" = / ] || (mv dist _dist && mkdir dist && cp _dist/index.html dist && mv _dist dist/"$SPARKLES_BASE")
RUN chmod -R a-w dist

FROM public.ecr.aws/docker/library/alpine:3.20

RUN apk add nginx # nginx-mod-http-brotli
RUN sed -i '/user nginx;/d' /etc/nginx/nginx.conf && echo 'daemon off;error_log stderr warn;' >> /etc/nginx/nginx.conf
ADD nginx.conf /etc/nginx/http.d/default.conf
COPY --from=builder /workspace/dist /srv/http
USER 100:101
CMD ["nginx", "-c", "/etc/nginx/nginx.conf"]
