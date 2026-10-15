import { parseArgs } from 'node:util';
import { convertCmd, convertOptions } from './commands/convert';
import { doctor } from './commands/doctor';
import { profileCmd, profileOptions, type ProfileValues } from './commands/profile';
import { validate, validateOptions } from './commands/validate';
import { EXIT, inputErrorMessage, Out } from './util';

const HELP = `yangsik — Markdown → 양식 HWPX 변환

  yangsik doctor                                  환경 점검
  yangsik convert <md...> -p <profile> [-o 출력] [--report f] [--preview dir] [--no-mermaid] [--strict] [--json]
  yangsik validate <md...> -p <profile> [--strict] [--json]
  yangsik profile check <profile> [--strict] [--json]
  yangsik profile test <profile> [--md 예제.md] [--no-mermaid] [--json]
  yangsik profile analyze <양식.hwpx>             양식 사실 JSON
  yangsik profile kinds [--all] | guide [주제] | schema
  yangsik profile generate --template 양식.hwpx --example-md 예제.md --provider <anthropic|openai|ollama> --model <id> --allow-send [--out 폴더] [--force]
                           (--print-prompt: 전송 내용만 보여 주고 종료)

종료 코드: 0 성공 · 1 입력/설정 오류 · 2 변환은 했으나 자체 검증 실패 · 3 예기치 못한 오류 · 4 --strict에서 경고
`;

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    console.log(HELP);
    return cmd ? EXIT.ok : EXIT.input;
  }
  try {
    switch (cmd) {
      case 'doctor': {
        const { values } = parseArgs({ args: rest, options: { json: { type: 'boolean' } } });
        return await doctor(rest, new Out(!!values.json));
      }
      case 'convert': {
        const { positionals, values } = parseArgs({ args: rest, allowPositionals: true, options: convertOptions });
        return await convertCmd(positionals, values, new Out(!!values.json));
      }
      case 'validate': {
        const { positionals, values } = parseArgs({ args: rest, allowPositionals: true, options: validateOptions });
        return await validate(positionals, values, new Out(!!values.json));
      }
      case 'profile': {
        const { positionals, values } = parseArgs({ args: rest, allowPositionals: true, options: profileOptions });
        const [sub, ...args] = positionals;
        return await profileCmd(sub, args, values as ProfileValues, new Out(!!values.json));
      }
      default:
        console.error(`알 수 없는 명령: ${cmd}\n\n${HELP}`);
        return EXIT.input;
    }
  } catch (e) {
    const msg = inputErrorMessage(e);
    if (msg !== null) {
      console.error(msg);
      return EXIT.input;
    }
    throw e;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(EXIT.internal);
  },
);
