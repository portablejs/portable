# @portable/idna API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/idna

```ts
class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

function toAscii(domain: string, options?: toAscii.Options): string;
namespace toAscii {
  type Options = {
    strict?: boolean | undefined;
  };
}

function toUnicode(domain: string, options?: toUnicode.Options): string;
namespace toUnicode {
  type Options = {
    strict?: boolean | undefined;
  };
}
```
