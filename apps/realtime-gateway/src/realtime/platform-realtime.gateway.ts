import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/realtime',
})
export class PlatformRealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  private server!: Server;

  handleConnection(client: Socket) {
    client.emit('connected', {
      socketId: client.id,
    });
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', {
      at: new Date().toISOString(),
    });
  }

  @SubscribeMessage('subscribe:user')
  subscribeUser(@ConnectedSocket() client: Socket, @MessageBody() body: { userId: string }) {
    client.join(`user:${body.userId}`);

    return {
      room: `user:${body.userId}`,
    };
  }

  publishUserEvent(userId: string, eventName: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit(eventName, payload);
  }
}
