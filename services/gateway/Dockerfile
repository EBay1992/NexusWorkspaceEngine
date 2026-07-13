# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/dotnet/sdk:9.0-alpine AS build
WORKDIR /src

COPY services/gateway/NuGet.config ./
COPY services/gateway/Orbit.Gateway.csproj ./
RUN dotnet restore Orbit.Gateway.csproj

COPY services/gateway/ ./
RUN dotnet publish Orbit.Gateway.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0-alpine AS runner
WORKDIR /app

ENV DOTNET_GCHeapHardLimit=0x10000000
ENV ASPNETCORE_URLS=http://0.0.0.0:5080

RUN apk add --no-cache wget \
  && addgroup -S orbit && adduser -S orbit -G orbit
USER orbit

COPY --from=build /app/publish .

EXPOSE 5080

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:5080/health || exit 1

ENTRYPOINT ["dotnet", "Orbit.Gateway.dll"]
