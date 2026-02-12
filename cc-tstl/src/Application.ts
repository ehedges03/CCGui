import { Logger } from "./lib/log";
import { WebsocketConnection } from "./services/WebsocketConnection";
import { Thread } from "./system/threads";

const logger = new Logger("Application");

export class Application {
    private wsService: WebsocketConnection;

    constructor(wsService: WebsocketConnection) {
        this.wsService = wsService;
    }

    public start() {
        this.wsService.connect(
            "ws://localhost:8080/ws",
            "oMAc62ccCb2iA29U0KpYlRqj9tN0aqLupIpc3cGYvHr0SwH-Vtk9-MA0as7hnLPYL_J4DCYLBQ7uBThywOxN0g",
        );
        let i = 0;
        while (this.wsService.connected()) {
            this.wsService.ping(i++);
            Thread.yield();
            if (i > 10) {
                this.wsService.close();
            }
        }
        logger.info("done");
    }
}
