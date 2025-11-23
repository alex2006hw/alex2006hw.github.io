FROM ubuntu:18.04 AS dev-box
# FROM debian:12 AS ubuntu-base

ENV DEBIAN_FRONTEND=noninteractive 
LABEL org.opencontainers.image.authors="nautilustechnologies"

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get upgrade -yq \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y python python-dev iptables dnsmasq uml-utilities \
    iputils-ping telnet net-tools build-essential curl wget vim \
    && DEBIAN_FRONTEND=noninteractiv apt-get clean

RUN curl https://bootstrap.pypa.io/pip/2.7/get-pip.py --output get-pip.py && python get-pip.py && rm get-pip.py
