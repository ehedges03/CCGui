import { Events } from "../system/event";
import { pack, unpack } from "../lib/MessagePack";
import { base64encode, verifyVersion } from "../lib/utils";
import { WebsocketConnection } from "../services/WebsocketConnection";
import { Threads } from "../system/threads";

const REMOTE_BASE_URL = "ws://localhost:8080/ws";

verifyVersion();

const testThread = Threads.createThread(() => {
    const wsService = new WebsocketConnection();

    wsService.setUrl(REMOTE_BASE_URL);
    wsService.setCredentials(
        "oMAc62ccCb2iA29U0KpYlRqj9tN0aqLupIpc3cGYvHr0SwH-Vtk9-MA0as7hnLPYL_J4DCYLBQ7uBThywOxN0g",
    );

    wsService.start();
    Threads.sleep(5);
    wsService.stop();
});

testThread.start();
Threads.run();
