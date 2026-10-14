export const validateDeploymentIdentity = (config, serviceName, environment) => {
  const service = config.services?.[serviceName];
  const env = service?.environment;
  const domain = environment === "staging" ? "https://sigap.marison-testing.biz.id" : "https://sigap.marisoncloud.com";
  const cloud = environment === "staging" ? "https://wrufczusfopgvwvxsmjk.supabase.co" : "https://xuhyodtmgwteyslhrkfx.supabase.co";
  const normalize = (value) => {
    try {
      const url = new URL(value);
      if (url.username || url.password || url.search || url.hash) return null;
      return url.origin + url.pathname.replace(/\/+$/, "");
    } catch { return null; }
  };
  if (!["staging", "production"].includes(environment) || !env
      || env.MARISON_DEPLOYMENT_ENVIRONMENT !== environment || normalize(env.APP_PUBLIC_URL) !== domain) return false;
  const backend = normalize(env.SUPABASE_URL);
  const frontend = normalize(env.VITE_SUPABASE_URL);
  const selfHosted = environment === "production" && backend === "http://172.20.100.3:8000"
    && frontend === domain + "/supabase";
  if (!(backend === cloud && frontend === cloud) && !selfHosted) return false;
  if (selfHosted && (normalize(env.STORAGE_SUPABASE_URL) !== "http://172.20.100.5:8000"
      || normalize(env.STORAGE_PUBLIC_BASE_URL) !== domain + "/storage/v1/object/public")) return false;
  return !service.build?.args || normalize(service.build.args.VITE_SUPABASE_URL) === frontend;
};

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/deploy-environment-identity.mjs")) {
  let body = "";
  process.stdin.on("data", (chunk) => { body += chunk; });
  process.stdin.on("end", () => {
    try {
      if (!validateDeploymentIdentity(JSON.parse(body), process.argv[2], process.argv[3])) throw new Error();
    } catch {
      process.stderr.write("Deployment environment identity mismatch.\n");
      process.exitCode = 1;
    }
  });
}
