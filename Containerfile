FROM alpine:edge as builder

WORKDIR /workspace
RUN apk add go npm git # gzip brotli
COPY package.json package-lock.json .
RUN npm ci
COPY helm-wasm/go.mod helm-wasm/go.sum helm-wasm/
RUN cd helm-wasm && go mod download
COPY . .
RUN cp .env.apiserver-proxy .env
RUN npm run build
# RUN find dist -type f \( -name '*.css' -or -name '*.js' -or -name '*.wasm' \) -exec gzip -9k {} \;
# RUN find dist -type f \( -name '*.css' -or -name '*.js' -or -name '*.wasm' \) -exec brotli -k -q 11 {} \;
RUN chmod -R a-w dist

FROM alpine:3.19

RUN apk add nginx # nginx-mod-http-brotli
RUN sed -i '/user nginx;/d' /etc/nginx/nginx.conf && echo 'daemon off;error_log stderr warn;' >> /etc/nginx/nginx.conf
ADD nginx.conf /etc/nginx/http.d/default.conf
COPY --from=builder /workspace/dist /srv/http
USER 100:101
CMD ["nginx", "-c", "/etc/nginx/nginx.conf"]
