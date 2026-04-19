import { RustFunction } from "cargo-lambda-cdk";
import { Construct } from "constructs";
import path from "path";

export type EventHandlerProps = {

}

export class EventHandler extends Construct {
    public constructor(scope: Construct, id: string, props: EventHandlerProps) {
        super(scope, id);
        this.createFunction();
    }

    private createFunction() {
        new RustFunction(this, "Lambda", {
            functionName: "EventHandler",
            manifestPath: path.join(__dirname, "..", "..", "..", "services", "event-handler")
        })
    }
}