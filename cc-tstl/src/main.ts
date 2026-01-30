import * as event from "./api/event";

export let running = true;

// Put your code here
const left = peripheral.wrap("left") as CommandPeripheral;
left.setCommand("kill @e");
left.runCommand();

event.runMetricCollector({
    interval_seconds: 1,
    response_timeout_seconds: 1,
    on_flush: (data) => {
        print(textutils.serialiseJSON(data));
    },
});

("Hello, world!");