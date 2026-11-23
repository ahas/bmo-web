import { appActHandler } from "../../../../utils/app-catalogue";

// The signed-in reader's approve of a shared app (docs/web.md, 「App catalogue」), answered with the app as it then stands.
export default appActHandler("approve");
