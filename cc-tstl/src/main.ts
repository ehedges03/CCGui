import { Application } from "./Application";
import { WebsocketConnection } from "./services/WebsocketConnection";
import { Events } from "./system/event";
import { Thread } from "./system/threads";

function startup() {
    const wsService = new WebsocketConnection();
    const application = new Application(wsService);
    application.start();
    Thread.newThread(application.start);
}

Thread.newThread(startup);
Thread.run();