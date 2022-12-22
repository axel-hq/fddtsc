const fs = require("fs");
const test = require("ava");

test("it outputs the right stuff", t => {
   const got = fs.readFileSync(`${__dirname}/../bin/testing.d.ts`, "utf8");
   const want = fs.readFileSync(`${__dirname}/testing.d.ts.txt`, "utf8");
   t.is(got, want);
});
