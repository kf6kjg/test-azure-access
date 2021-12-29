# syntax=docker/dockerfile:1.0.0-experimental
# * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
FROM --platform=linux/amd64 node:16-alpine3.14

ARG NODE_ENV=production
ARG START_CMD="npm run start"

# Add user so we don't run as root.
# Give the user some quality-of-life tooling for the rare occasion we access its shell directly.
RUN \
    adduser --disabled-password appuser && \
    mkdir -p /home/appuser/Downloads /usr/src/dist && \
    \
    echo "alias ls='ls --color=auto'" >> /home/appuser/.profile && \
    echo "alias ll='ls -alF'" >> /home/appuser/.profile && \
    echo 'PS1="${debian_chroot:+($debian_chroot)}\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ "' >> /home/appuser/.profile && \
    echo 'PS1="\[\e]0;${debian_chroot:+($debian_chroot)}\u@\h: \w\a\]$PS1"' >> /home/appuser/.profile && \
    chown -R appuser:appuser /home/appuser && \
    true;

# Copy all the things, barring the ignored items.
COPY . /usr/src

# Active work directory.
WORKDIR /usr/src

ENV \
    NODE_ENV=$NODE_ENV \
    START_CMD=$START_CMD \
    TERM=xterm-color

# Build the system and clean up.
RUN \
    npm ci --production=false --unsafe-perm --no-optional && \
    npm run build --if-present && \
    npm ci --production=true --unsafe-perm --no-optional && \
    npm cache clean --force && \
    rm -rf app && \
    find . -maxdepth 1 -type f -and -not -iname 'package*.json' -and -not -iname '*.pem' && \
    true;

# Run everything after as non-privileged user.
USER appuser

CMD $START_CMD

EXPOSE 3000 8000
# Expose both ports generically.
