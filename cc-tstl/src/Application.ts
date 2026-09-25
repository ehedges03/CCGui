import { Logger } from "./lib/log";
import { WebsocketConnection } from "./services/WebsocketConnection";
import { Threads } from "./system/threads";

const logger = new Logger("Application");

export class Application implements Threads.Runnable {
    private wsService: WebsocketConnection;

    constructor(wsService: WebsocketConnection) {
        this.wsService = wsService;
    }

    public run() {
        this.wsService.setUrl("ws://localhost:8080/ws");
        this.wsService.setCredentials(
            "oMAc62ccCb2iA29U0KpYlRqj9tN0aqLupIpc3cGYvHr0SwH-Vtk9-MA0as7hnLPYL_J4DCYLBQ7uBThywOxN0g",
        );
        this.wsService.start();

        let i = 0;
        while (this.wsService.connected()) {
            this.wsService.ping(i++);
            Threads.yield();
            if (i > 10) {
                this.wsService.stop();
            }
        }
        logger.info("done");
    }
}
