# candump log file format
```
+++++++++++++++++++------------------------------- UTC time in seconds
||||||||||||||||||| ++++-------------------------- canbus OS device interface
||||||||||||||||||| |||| +++---------------------- command id
||||||||||||||||||| |||| |||+++++----------------- node id
||||||||||||||||||| |||| |||||||| ++++++++++++++++ payload
||||||||||||||||||| |||| |||||||| ||||||||||||||||
(1708620903.978650) can1 10050001#AA032100652C4B18
```

### command ids
* `004` start for message type `"A"` -- node id + cmd id incr by 0x04
* `005` start for message type `"A"` -- node id + cmd id incr by 0x04
* `100`,`101`,`102` start, continue, end for message type `"B"`
* `120`,`121`,`122` start, continue, end for message type `"C"`
* `106` is a standalone message `"D"` -- todo, short, spammy
* `10A` is a standalone message `"E"` -- todo, rare

### module streams
* sources can be identified by their streams
* most streams have contiguous increasing sequence ids or 0000s
* a stream is uniquely identified by a compound key containing
    * module address
    * module address D
    * device id

## message type "A" structure
* composite byte values are encoded as little endian
* low byte of sequence id is used to XOR message data
```
++++--------------------------------- fixed AA02
|||| ++++---------------------------- record length
|||| |||| ++------------------------- record type
|||| |||| || ++---------------------- message type ??
|||| |||| || || ++++++--------------- sequence id
|||| |||| || || |||||| ++++++++++++++ unknown
|||| |||| || || |||||| ||||||||||||||
AA02 0001 70 00 BC1FD7 01073C53350100 <record data>

             1  1 1 1  1  2  2  2  2  hex string pos
0 2  4 6  8  0  2 4 6  8  0  2  4  6

0 1  2 3  4  5  6 7 8  9  1  1  1  1  bytes/buffer pos
                          0  1  2  3
```

## message type "B" structure
* composite byte values are encoded as little endian
* low byte of sequence id is used to XOR message data
```
++++--------------------------------------------- fixed AA03
|||| ++++---------------------------------------- record length
|||| |||| ++------------------------------------- record type
|||| |||| || ++---------------------------------- request/response type (trigger xor)
|||| |||| || || ++++++--------------------------- sequence id
|||| |||| || || |||||| ++------------------------ sequence hi
|||| |||| || || |||||| || ++--------------------- module detail
|||| |||| || || |||||| || || ++------------------ module type
|||| |||| || || |||||| || || || ++--------------- module address
|||| |||| || || |||||| || || || || ++------------ module record type
|||| |||| || || |||||| || || || || || ++--------- module address D
|||| |||| || || |||||| || || || || || || ++ ++ ++ other info ??
|||| |||| || || |||||| || || || || || || || || ||
AA03 0020 70 00 BC1FD7 01 07 3C 53 35 01 00 35 10 <record data>

             1  1 1 1  1  2  2  2  2  2  3  3  3  hex string pos
0 2  4 6  8  0  2 4 6  8  0  2  4  6  8  0  2  4

0 1  2 3  4  5  6 7 8  9  1  1  1  1  1  1  1  1  bytes/buffer pos
                          0  1  2  3  4  5  6  7
```

## message type "C" structure
* composite byte values are encoded as little endian
* newest message type arrived with PowerKit v2 and PowerDock
```
++++----------------------------------- fixed AA03
|||| ++++------------------------------ record length
|||| |||| ++--------------------------- record type
|||| |||| || ++------------------------ request/response type
|||| |||| || || ++ -------------------- XOR for payload
|||| |||| || || || || || ++++++++++++++ payload
|||| |||| || || || || || ||||||||||||||
AA03 0004 00 00 XX 00 00 00000000000000

             1  1 1 1  1  2  2  2  2  hex string pos
0 2  4 6  8  0  2 4 6  8  0  2  4  6

0 1  2 3  4  5  6 7 8  9  1  1  1  1  bytes/buffer pos
                          0  1  2  3
```