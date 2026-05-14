FROM mcr.microsoft.com/playwright:v1.60.0-noble

RUN useradd -m -u 1000 user

ENV HOME=/home/user
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR $HOME/app

COPY --chown=user:user package*.json ./

USER user
RUN npm ci --omit=dev

COPY --chown=user:user . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=7860

EXPOSE 7860

CMD ["npm", "start"]
