## ecoflow api structure map

most data comes from looking at PowerKit CANbus data. the first table shows a mapping of EF API key prefixes to the CAN nodes that produce the relevant records. other tables are notes on devices mapping to serial number prefixes. many messages contain serial numbers and other information you may wish to guard. be careful about sharing logs if this matters to you.

### unique serial data x'd out

| key prefix                     | node id(s)   |
|--------------------------------|--------------|
| bbcin.M1093-DCIN-xxxxx         | 50001        |
| bbcout.M1093-DCOU-xxxxx        | 50001        |
| bmsTotal                       | 02001, 03001 |
| bp5000.M101Z3B4xxxxxxxx        | 03001        |
| bp5000.M101Z3B4xxxxxxxx        | 03002        |
| bp5000.M101Z3B4xxxxxxxx        | 03003        |
| ichigh.M1095-PSDH-xxxxx        | 02001        |
| iclow.M10953-PSDL-xxxx         | 02001        |
| kitscc.M1096-MPPT-xxxxx        | 02001        |
| ldac.M10EZAB1xxxxxxxx          | 54001        |
| lddc.M10E1-LDDC-xxxxx          |              |
| onLineModuleSnList[0]          |              |
| onLineModuleSnList[1]          |              |
| onLineModuleSnList[2]          |              |
| onLineModuleSnList[3]          |              |
| onLineModuleSnList[4]          |              |
| onLineModuleSnList[5]          |              |
| onLineModuleSnList[6]          |              |
| onLineModuleSnList[7]          |              |
| onLineModuleSnList[8]          |              |
| onLineModuleSnList[9]          |              |
| onLineModuleSnList[10]         |              |
| wireless.M109ZAB4xxxxxxxx      | 50001        |

## device to serial number map

| device id | serial #          | comment
|-----------|-------------------|---------
| 02001-02  | M1095-PSDL-xxxxx  |
| 02001-04  | M1095-PSDH-xxxxx  |
| 02001-05  | M1096-MPPT-xxxxx  |
| 03001-03  | M101Z3B4xxxxxxxx  | Battery
| 03002-03  | M101Z3B4xxxxxxxx  | Battery
| 03003-03  | M101Z3B4xxxxxxxx  | Battery
| 34001-34  | M106ZAB1xxxxxxxx  | 
| 50001-35  | M109ZAB4xxxxxxxx  | Power Hub
| 50001-50  | M1093-DCIN-xxxxx  |
| 50001-51  | M1093-DCOU-xxxxx  |
| 54001-53  | M10EZAB1xxxxxxxx  |
| 54001-54  | M10E1-LDDC-xxxxx  | AC/DC Smart Panel (DC)
| 12001-xx  | M3D1Z1B4xxxxxxxx  | Power Dock

## smo (module) to serial #

| smo   | serial #         | comment
|-------|------------------|----------
| 50-01 | M1093-DCIN-xxxxx | 
| 51-01 | M1093-DCOU-xxxxx | 
| 05-01 | M1096-MPPT-xxxxx | 
| 04-01 | M1095-PSDH-xxxxx | 
| 02-01 | M1095-PSDL-xxxxx | 
| 03-01 | M101Z3B4xxxxxxxx | Battery
| 03-11 | M101Z3B4xxxxxxxx | Battery
| 03-13 | M101Z3B4xxxxxxxx | Battery
| 34-01 | M106ZAB1xxxxxxxx | 
| 35-01 | M109ZAB4xxxxxxxx | Power Hub
| 54-01 | M10E1-LDDC-xxxxx | AC/DC Smart Panel (DC)
| 53-01 | M10EZAB1xxxxxxxx | AC/DC Smart Panel (AC)
| 12-01 | M3D1Z1B4xxxxxxxx | Power Dock


## PowerKit toggle PV input control from console
```
str = 52-01-67 ??
node = 34001

dv4 = 0351
typ = CB:03 for 3 "attention" messages then one of:

dv4 = 0506
typ = F4:05 for PV1 toggle event
typ = F4:50 for PV2 toggle event
```

## PowerKit toggle PV input from ios app
* toggle/attn reversed
* CB:00 maybe should be CB:03

```
str = 20-01-??
node = 50001

dv4 = 0506
typ = A3:05 for PV1 toggle event
typ = A3:50 for PV2 toggle event

dv4 = 0351
typ = CB:00 "attention" message then one of:
```
