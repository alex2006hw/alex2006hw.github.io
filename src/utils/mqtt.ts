export class MQTTBus {
    private channel: BroadcastChannel;
    private listeners: Map<string, Set<(payload: any) => void>> = new Map();

    constructor(channelName: string = 'v86_mqtt_bus') {
        this.channel = new BroadcastChannel(channelName);
        this.channel.onmessage = (event) => {
            const { topic, payload } = event.data;
            if (this.listeners.has(topic)) {
                this.listeners.get(topic)!.forEach(cb => cb(payload));
            }
        };
    }

    publish(topic: string, payload: any) {
        console.log(`[MQTTBus] Publishing to topic '${topic}':`, payload);
        this.channel.postMessage({ topic, payload });
    }

    subscribe(topic: string, callback: (payload: any) => void) {
        if (!this.listeners.has(topic)) {
            this.listeners.set(topic, new Set());
        }
        this.listeners.get(topic)!.add(callback);
        return () => {
            this.listeners.get(topic)?.delete(callback);
        };
    }
}

export const mqttBus = new MQTTBus();
