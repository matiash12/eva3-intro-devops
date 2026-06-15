# Stage 1: Build React app
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install --legacy-peer-deps
COPY public ./public
COPY src ./src
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:1.27-alpine
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
