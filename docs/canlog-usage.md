## `canlog` command line arguments

some arguments take values (`Y` vs `N`) and some take optional arguments meaning you can use the parameter alone (no arguemnt) or with a qualifying string. these are marked `optional`. the string can also be a `CSV` for parameters that take lists.

| option    | argument | description
|-----------|----------|-------------
| --chan    | Y        | `filter` to a given channel
| --chr     | N        | output ASCII chars in message payload
| --count   | N        | at completion, output counts of various tracked variables
| --crc     | N        | output crc with message data
| --csv     | N        | input type CSV instead of default candump format
| --dev     | Y        | `filter` to a given device id
| --dhas    | Y        | `filter` to messages with bytes in header preamble
| --dup     | N        | flag detected duplicate messages with `*`
| --duptime | Y        | window for duplicate detection in milliseconds
| --dv1     | Y        | `filter` to messages with a given `dv1` value
| --dv4     | CSV      | `filter` to messages with matching `dv4` values
| --err     | N        | show messages containing errors (crc, length, etc)
| --excl    | optional | use previously saved `counts` file to filter current stream <br> optional argument `str` to filter only previously seem stream ids
| --field   | Y        | outputs only the named field from a decoded message record
| --flg     | Y        | `filter` to message type A's starting command id (`004`, `005`)
| --hdr     | N        | print full message header in addition to extracted fields
| --hex     | optional | print message payload as hex. use `diff` to highlight changes
| --hexhas  | Y        | `filter` to payload hex containing given string
| --hdrhas  | Y        | `filter` to header hex containing given string
| --hist    | N        | at completion, produce a header token histogram
| --len     | Y        | `filter` to messages with a given length
| --mad     | Y        | `filter` to messages with a given module address
| --mda     | Y        | `filter` to messages with a given module "D" address
| --mde     | Y        | `filter` to messages with a given module "detail"
| --meta    | optional | compare data with EF api output (see source)
| --mrt     | Y        | `filter` to messages with a given module record type
| --msg     | N        | print raw message payload
| --node    | CSV      | `filter` to messages with matching node id values
| --pairs   | CSV      | output payload pairs for message channel "C"
| --pick    | optional | output raw CAN messages for replay. optionally takes timestamp
| --pivot   | optional | at completion, create `cl-pivot.tsv` of `typ` vs `time` <br> takes option number of time characters from `HHmmssSSS`
| --pmm     | Y        | output EF api style records for each minute of data
| --pre     | M        | `filter` to messages with a given prefix (`AA02`, etc)
| --rec     | optional | output decoded message records. `used` shows byte coverage
| --reduce  | N        | `filter` output by removing duplicates within a window
| --regen   | N        | output filtered canbus formatted date stamped logs <br> this allows CAN streams to be processed to data storage <br> and also cleaned up and stored on disk for later analysis
| --rrf     | CSV      | `filter` to messages with matching rrf header values
| --rty     | CSV      | `filter` to messages with matching rty record type
| --sample  | optional | enable sampling defined per-record type in `structs.json`
| --scan    | Y        | enable payload scanning for value ranges (see source) <br> establish correlations with EF api data in given time windows
| --scanf   | Y        | like `--scan` for float values
| --seq     | N        | output stream sequence delta value
| --sh2     | Y        | `filter` to messages with a given header sh2 value
| --signed  | N        | interpret `--scan` values as signed when matching
| --smo     | optional | show and/or `filter` to messages with a given module stream
| --stat    | N        | at completion, create a `cl-streams.tsv` report
| --str     | optional | show and/or `filter` to messages with a given device stream
| --sum     | N        | at completion, output sums of various tracked variables
| --tinc    | ms       | synthetic record time increment in milliseconds for CSV input format
| --typ     | CSV      | `filter` to messages with matching type header values
| --ty2     | CSV      | `filter` to messages with matching extended type header values
| --val     | N        | output hex payload values as decimal values
| --xrty    | CSV      | `filter` to exclude (vs match) given record types
