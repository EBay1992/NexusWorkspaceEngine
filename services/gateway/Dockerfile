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

RUN apk add --no-cache wget \
  && addgroup -S orbit && adduser -S orbit -G orbit
USER orbit

COPY --from=build /app/publish .

EXPOSE 5080

ENTRYPOINT ["sh", "-c", "export ASPNETCORE_URLS=http://0.0.0.0:${PORT:-5080} && exec dotnet Orbit.Gateway.dll"]
