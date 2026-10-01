// Prints a bcrypt hash for ADMIN_PASSWORD_HASH. The password is typed here,
// never stored: run `npm run hash-password` and paste the output into the
// hosting environment variables.
import readline from "node:readline";
import bcrypt from "bcryptjs";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); };

rl.question("Admin password (12+ characters): ", async (password) => {
  rl.close();
  process.stdout.write("\n");
  if (password.length < 12) { console.error("Password is too short."); process.exit(1); }
  console.log(await bcrypt.hash(password, 12));
});
muted = true;
