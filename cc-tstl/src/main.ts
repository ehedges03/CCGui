import * as event from "./event";

// Put your code here
const left = peripheral.wrap("left") as CommandPeripheral;
left.setCommand("kill @e");
left.runCommand();

const timer = os.startTimer(5);
while(true) {
    const ev = event.pullEventAs(event.TimerEvent, "timer");
    if (ev && ev.id == timer) break;
}
