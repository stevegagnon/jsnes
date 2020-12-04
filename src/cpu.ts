import { CpuInfo } from "os";

let utils = require("./utils");

export enum Irq {
  Normal = 0,
  Nmi = 1,
  Reset = 2,
}

export function CPU(mmap, halt) {
  const JSON_PROPERTIES = [
    "mem",
    "cyclesToHalt",
    "irqRequested",
    "irqType",
    // Registers
    "REG_ACC",
    "REG_X",
    "REG_Y",
    "REG_SP",
    "REG_PC",
    "REG_PC_NEW",
    "REG_STATUS",
    // Status
    "F_CARRY",
    "F_DECIMAL",
    "F_INTERRUPT",
    "F_INTERRUPT_NEW",
    "F_OVERFLOW",
    "F_SIGN",
    "F_ZERO",
    "F_NOTUSED",
    "F_NOTUSED_NEW",
    "F_BRK",
    "F_BRK_NEW",
  ]

  // Keep Chrome happy
  let mem = null;
  let REG_ACC = null;
  let REG_X = null;
  let REG_Y = null;
  let REG_SP = null;
  let REG_PC = null;
  let REG_PC_NEW = null;
  let REG_STATUS = null;
  let F_CARRY = null;
  let F_DECIMAL = null;
  let F_INTERRUPT = null;
  let F_INTERRUPT_NEW = null;
  let F_OVERFLOW = null;
  let F_SIGN = null;
  let F_ZERO = null;
  let F_NOTUSED = null;
  let F_NOTUSED_NEW = null;
  let F_BRK = null;
  let F_BRK_NEW = null;
  let opdata = null;
  let cyclesToHalt = null;
  let crash = null;
  let irqRequested = null;
  let irqType = null;

  reset();

  function reset() {
    // Main memory
    mem = new Array(0x10000);

    for (let i = 0; i < 0x2000; i++) {
      mem[i] = 0xff;
    }
    for (let p = 0; p < 4; p++) {
      let j = p * 0x800;
      mem[j + 0x008] = 0xf7;
      mem[j + 0x009] = 0xef;
      mem[j + 0x00a] = 0xdf;
      mem[j + 0x00f] = 0xbf;
    }
    for (let k = 0x2001; k < mem.length; k++) {
      mem[k] = 0;
    }

    // CPU Registers:
    REG_ACC = 0;
    REG_X = 0;
    REG_Y = 0;
    // Reset Stack pointer:
    REG_SP = 0x01ff;
    // Reset Program counter:
    REG_PC = 0x8000 - 1;
    REG_PC_NEW = 0x8000 - 1;
    // Reset Status register:
    REG_STATUS = 0x28;

    setStatus(0x28);

    // Set flags:
    F_CARRY = 0;
    F_DECIMAL = 0;
    F_INTERRUPT = 1;
    F_INTERRUPT_NEW = 1;
    F_OVERFLOW = 0;
    F_SIGN = 0;
    F_ZERO = 1;

    F_NOTUSED = 1;
    F_NOTUSED_NEW = 1;
    F_BRK = 1;
    F_BRK_NEW = 1;

    opdata = new OpData().opdata;
    cyclesToHalt = 0;

    // Reset crash flag:
    crash = false;

    // Interrupt notification:
    irqRequested = false;
    irqType = null;
  }

  // Emulates a single CPU instruction, returns the number of cycles
  function emulate() {
    let temp;
    let add;

    // Check interrupts:
    if (irqRequested) {
      temp =
        F_CARRY |
        ((F_ZERO === 0 ? 1 : 0) << 1) |
        (F_INTERRUPT << 2) |
        (F_DECIMAL << 3) |
        (F_BRK << 4) |
        (F_NOTUSED << 5) |
        (F_OVERFLOW << 6) |
        (F_SIGN << 7);

      REG_PC_NEW = REG_PC;
      F_INTERRUPT_NEW = F_INTERRUPT;
      switch (irqType) {
        case 0: {
          // Normal IRQ:
          if (F_INTERRUPT !== 0) {
            // console.log("Interrupt was masked.");
            break;
          }
          doIrq(temp);
          // console.log("Did normal IRQ. I="+F_INTERRUPT);
          break;
        }
        case 1: {
          // NMI:
          doNonMaskableInterrupt(temp);
          break;
        }
        case 2: {
          // Reset:
          doResetInterrupt();
          break;
        }
      }

      REG_PC = REG_PC_NEW;
      F_INTERRUPT = F_INTERRUPT_NEW;
      F_BRK = F_BRK_NEW;
      irqRequested = false;
    }

    let opinf = opdata[mmap.load(REG_PC + 1)];
    let cycleCount = opinf >> 24;
    let cycleAdd = 0;

    // Find address mode:
    let addrMode = (opinf >> 8) & 0xff;

    // Increment PC by number of op bytes:
    let opaddr = REG_PC;
    REG_PC += (opinf >> 16) & 0xff;

    let addr = 0;
    switch (addrMode) {
      case 0: {
        // Zero Page mode. Use the address given after the opcode,
        // but without high byte.
        addr = load(opaddr + 2);
        break;
      }
      case 1: {
        // Relative mode.
        addr = load(opaddr + 2);
        if (addr < 0x80) {
          addr += REG_PC;
        } else {
          addr += REG_PC - 256;
        }
        break;
      }
      case 2: {
        // Ignore. Address is implied in instruction.
        break;
      }
      case 3: {
        // Absolute mode. Use the two bytes following the opcode as
        // an address.
        addr = load16bit(opaddr + 2);
        break;
      }
      case 4: {
        // Accumulator mode. The address is in the accumulator
        // register.
        addr = REG_ACC;
        break;
      }
      case 5: {
        // Immediate mode. The value is given after the opcode.
        addr = REG_PC;
        break;
      }
      case 6: {
        // Zero Page Indexed mode, X as index. Use the address given
        // after the opcode, then add the
        // X register to it to get the final address.
        addr = (load(opaddr + 2) + REG_X) & 0xff;
        break;
      }
      case 7: {
        // Zero Page Indexed mode, Y as index. Use the address given
        // after the opcode, then add the
        // Y register to it to get the final address.
        addr = (load(opaddr + 2) + REG_Y) & 0xff;
        break;
      }
      case 8: {
        // Absolute Indexed Mode, X as index. Same as zero page
        // indexed, but with the high byte.
        addr = load16bit(opaddr + 2);
        if ((addr & 0xff00) !== ((addr + REG_X) & 0xff00)) {
          cycleAdd = 1;
        }
        addr += REG_X;
        break;
      }
      case 9: {
        // Absolute Indexed Mode, Y as index. Same as zero page
        // indexed, but with the high byte.
        addr = load16bit(opaddr + 2);
        if ((addr & 0xff00) !== ((addr + REG_Y) & 0xff00)) {
          cycleAdd = 1;
        }
        addr += REG_Y;
        break;
      }
      case 10: {
        // Pre-indexed Indirect mode. Find the 16-bit address
        // starting at the given location plus
        // the current X register. The value is the contents of that
        // address.
        addr = load(opaddr + 2);
        if ((addr & 0xff00) !== ((addr + REG_X) & 0xff00)) {
          cycleAdd = 1;
        }
        addr += REG_X;
        addr &= 0xff;
        addr = load16bit(addr);
        break;
      }
      case 11: {
        // Post-indexed Indirect mode. Find the 16-bit address
        // contained in the given location
        // (and the one following). Add to that address the contents
        // of the Y register. Fetch the value
        // stored at that adress.
        addr = load16bit(load(opaddr + 2));
        if ((addr & 0xff00) !== ((addr + REG_Y) & 0xff00)) {
          cycleAdd = 1;
        }
        addr += REG_Y;
        break;
      }
      case 12: {
        // Indirect Absolute mode. Find the 16-bit address contained
        // at the given location.
        addr = load16bit(opaddr + 2); // Find op
        if (addr < 0x1fff) {
          addr =
            mem[addr] +
            (mem[(addr & 0xff00) | (((addr & 0xff) + 1) & 0xff)] << 8); // Read from address given in op
        } else {
          addr =
            mmap.load(addr) +
            (mmap.load(
              (addr & 0xff00) | (((addr & 0xff) + 1) & 0xff)
            ) <<
              8);
        }
        break;
      }
    }
    // Wrap around for addresses above 0xFFFF:
    addr &= 0xffff;

    // ----------------------------------------------------------------------------------------------------
    // Decode & execute instruction:
    // ----------------------------------------------------------------------------------------------------

    // This should be compiled to a jump table.
    switch (opinf & 0xff) {
      case 0: {
        // *******
        // * ADC *
        // *******

        // Add with carry.
        temp = REG_ACC + load(addr) + F_CARRY;

        if (
          ((REG_ACC ^ load(addr)) & 0x80) === 0 &&
          ((REG_ACC ^ temp) & 0x80) !== 0
        ) {
          F_OVERFLOW = 1;
        } else {
          F_OVERFLOW = 0;
        }
        F_CARRY = temp > 255 ? 1 : 0;
        F_SIGN = (temp >> 7) & 1;
        F_ZERO = temp & 0xff;
        REG_ACC = temp & 255;
        cycleCount += cycleAdd;
        break;
      }
      case 1: {
        // *******
        // * AND *
        // *******

        // AND memory with accumulator.
        REG_ACC = REG_ACC & load(addr);
        F_SIGN = (REG_ACC >> 7) & 1;
        F_ZERO = REG_ACC;
        if (addrMode !== 11) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }
      case 2: {
        // *******
        // * ASL *
        // *******

        // Shift left one bit
        if (addrMode === 4) {
          // ADDR_ACC = 4

          F_CARRY = (REG_ACC >> 7) & 1;
          REG_ACC = (REG_ACC << 1) & 255;
          F_SIGN = (REG_ACC >> 7) & 1;
          F_ZERO = REG_ACC;
        } else {
          temp = load(addr);
          F_CARRY = (temp >> 7) & 1;
          temp = (temp << 1) & 255;
          F_SIGN = (temp >> 7) & 1;
          F_ZERO = temp;
          write(addr, temp);
        }
        break;
      }
      case 3: {
        // *******
        // * BCC *
        // *******

        // Branch on carry clear
        if (F_CARRY === 0) {
          cycleCount += (opaddr & 0xff00) !== (addr & 0xff00) ? 2 : 1;
          REG_PC = addr;
        }
        break;
      }
      case 4: {
        // *******
        // * BCS *
        // *******

        // Branch on carry set
        if (F_CARRY === 1) {
          cycleCount += (opaddr & 0xff00) !== (addr & 0xff00) ? 2 : 1;
          REG_PC = addr;
        }
        break;
      }
      case 5: {
        // *******
        // * BEQ *
        // *******

        // Branch on zero
        if (F_ZERO === 0) {
          cycleCount += (opaddr & 0xff00) !== (addr & 0xff00) ? 2 : 1;
          REG_PC = addr;
        }
        break;
      }
      case 6: {
        // *******
        // * BIT *
        // *******

        temp = load(addr);
        F_SIGN = (temp >> 7) & 1;
        F_OVERFLOW = (temp >> 6) & 1;
        temp &= REG_ACC;
        F_ZERO = temp;
        break;
      }
      case 7: {
        // *******
        // * BMI *
        // *******

        // Branch on negative result
        if (F_SIGN === 1) {
          cycleCount++;
          REG_PC = addr;
        }
        break;
      }
      case 8: {
        // *******
        // * BNE *
        // *******

        // Branch on not zero
        if (F_ZERO !== 0) {
          cycleCount += (opaddr & 0xff00) !== (addr & 0xff00) ? 2 : 1;
          REG_PC = addr;
        }
        break;
      }
      case 9: {
        // *******
        // * BPL *
        // *******

        // Branch on positive result
        if (F_SIGN === 0) {
          cycleCount += (opaddr & 0xff00) !== (addr & 0xff00) ? 2 : 1;
          REG_PC = addr;
        }
        break;
      }
      case 10: {
        // *******
        // * BRK *
        // *******

        REG_PC += 2;
        push((REG_PC >> 8) & 255);
        push(REG_PC & 255);
        F_BRK = 1;

        push(
          F_CARRY |
          ((F_ZERO === 0 ? 1 : 0) << 1) |
          (F_INTERRUPT << 2) |
          (F_DECIMAL << 3) |
          (F_BRK << 4) |
          (F_NOTUSED << 5) |
          (F_OVERFLOW << 6) |
          (F_SIGN << 7)
        );

        F_INTERRUPT = 1;
        //REG_PC = load(0xFFFE) | (load(0xFFFF) << 8);
        REG_PC = load16bit(0xfffe);
        REG_PC--;
        break;
      }
      case 11: {
        // *******
        // * BVC *
        // *******

        // Branch on overflow clear
        if (F_OVERFLOW === 0) {
          cycleCount += (opaddr & 0xff00) !== (addr & 0xff00) ? 2 : 1;
          REG_PC = addr;
        }
        break;
      }
      case 12: {
        // *******
        // * BVS *
        // *******

        // Branch on overflow set
        if (F_OVERFLOW === 1) {
          cycleCount += (opaddr & 0xff00) !== (addr & 0xff00) ? 2 : 1;
          REG_PC = addr;
        }
        break;
      }
      case 13: {
        // *******
        // * CLC *
        // *******

        // Clear carry flag
        F_CARRY = 0;
        break;
      }
      case 14: {
        // *******
        // * CLD *
        // *******

        // Clear decimal flag
        F_DECIMAL = 0;
        break;
      }
      case 15: {
        // *******
        // * CLI *
        // *******

        // Clear interrupt flag
        F_INTERRUPT = 0;
        break;
      }
      case 16: {
        // *******
        // * CLV *
        // *******

        // Clear overflow flag
        F_OVERFLOW = 0;
        break;
      }
      case 17: {
        // *******
        // * CMP *
        // *******

        // Compare memory and accumulator:
        temp = REG_ACC - load(addr);
        F_CARRY = temp >= 0 ? 1 : 0;
        F_SIGN = (temp >> 7) & 1;
        F_ZERO = temp & 0xff;
        cycleCount += cycleAdd;
        break;
      }
      case 18: {
        // *******
        // * CPX *
        // *******

        // Compare memory and index X:
        temp = REG_X - load(addr);
        F_CARRY = temp >= 0 ? 1 : 0;
        F_SIGN = (temp >> 7) & 1;
        F_ZERO = temp & 0xff;
        break;
      }
      case 19: {
        // *******
        // * CPY *
        // *******

        // Compare memory and index Y:
        temp = REG_Y - load(addr);
        F_CARRY = temp >= 0 ? 1 : 0;
        F_SIGN = (temp >> 7) & 1;
        F_ZERO = temp & 0xff;
        break;
      }
      case 20: {
        // *******
        // * DEC *
        // *******

        // Decrement memory by one:
        temp = (load(addr) - 1) & 0xff;
        F_SIGN = (temp >> 7) & 1;
        F_ZERO = temp;
        write(addr, temp);
        break;
      }
      case 21: {
        // *******
        // * DEX *
        // *******

        // Decrement index X by one:
        REG_X = (REG_X - 1) & 0xff;
        F_SIGN = (REG_X >> 7) & 1;
        F_ZERO = REG_X;
        break;
      }
      case 22: {
        // *******
        // * DEY *
        // *******

        // Decrement index Y by one:
        REG_Y = (REG_Y - 1) & 0xff;
        F_SIGN = (REG_Y >> 7) & 1;
        F_ZERO = REG_Y;
        break;
      }
      case 23: {
        // *******
        // * EOR *
        // *******

        // XOR Memory with accumulator, store in accumulator:
        REG_ACC = (load(addr) ^ REG_ACC) & 0xff;
        F_SIGN = (REG_ACC >> 7) & 1;
        F_ZERO = REG_ACC;
        cycleCount += cycleAdd;
        break;
      }
      case 24: {
        // *******
        // * INC *
        // *******

        // Increment memory by one:
        temp = (load(addr) + 1) & 0xff;
        F_SIGN = (temp >> 7) & 1;
        F_ZERO = temp;
        write(addr, temp & 0xff);
        break;
      }
      case 25: {
        // *******
        // * INX *
        // *******

        // Increment index X by one:
        REG_X = (REG_X + 1) & 0xff;
        F_SIGN = (REG_X >> 7) & 1;
        F_ZERO = REG_X;
        break;
      }
      case 26: {
        // *******
        // * INY *
        // *******

        // Increment index Y by one:
        REG_Y++;
        REG_Y &= 0xff;
        F_SIGN = (REG_Y >> 7) & 1;
        F_ZERO = REG_Y;
        break;
      }
      case 27: {
        // *******
        // * JMP *
        // *******

        // Jump to new location:
        REG_PC = addr - 1;
        break;
      }
      case 28: {
        // *******
        // * JSR *
        // *******

        // Jump to new location, saving return address.
        // Push return address on stack:
        push((REG_PC >> 8) & 255);
        push(REG_PC & 255);
        REG_PC = addr - 1;
        break;
      }
      case 29: {
        // *******
        // * LDA *
        // *******

        // Load accumulator with memory:
        REG_ACC = load(addr);
        F_SIGN = (REG_ACC >> 7) & 1;
        F_ZERO = REG_ACC;
        cycleCount += cycleAdd;
        break;
      }
      case 30: {
        // *******
        // * LDX *
        // *******

        // Load index X with memory:
        REG_X = load(addr);
        F_SIGN = (REG_X >> 7) & 1;
        F_ZERO = REG_X;
        cycleCount += cycleAdd;
        break;
      }
      case 31: {
        // *******
        // * LDY *
        // *******

        // Load index Y with memory:
        REG_Y = load(addr);
        F_SIGN = (REG_Y >> 7) & 1;
        F_ZERO = REG_Y;
        cycleCount += cycleAdd;
        break;
      }
      case 32: {
        // *******
        // * LSR *
        // *******

        // Shift right one bit:
        if (addrMode === 4) {
          // ADDR_ACC

          temp = REG_ACC & 0xff;
          F_CARRY = temp & 1;
          temp >>= 1;
          REG_ACC = temp;
        } else {
          temp = load(addr) & 0xff;
          F_CARRY = temp & 1;
          temp >>= 1;
          write(addr, temp);
        }
        F_SIGN = 0;
        F_ZERO = temp;
        break;
      }
      case 33: {
        // *******
        // * NOP *
        // *******

        // No OPeration.
        // Ignore.
        break;
      }
      case 34: {
        // *******
        // * ORA *
        // *******

        // OR memory with accumulator, store in accumulator.
        temp = (load(addr) | REG_ACC) & 255;
        F_SIGN = (temp >> 7) & 1;
        F_ZERO = temp;
        REG_ACC = temp;
        if (addrMode !== 11) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }
      case 35: {
        // *******
        // * PHA *
        // *******

        // Push accumulator on stack
        push(REG_ACC);
        break;
      }
      case 36: {
        // *******
        // * PHP *
        // *******

        // Push processor status on stack
        F_BRK = 1;
        push(
          F_CARRY |
          ((F_ZERO === 0 ? 1 : 0) << 1) |
          (F_INTERRUPT << 2) |
          (F_DECIMAL << 3) |
          (F_BRK << 4) |
          (F_NOTUSED << 5) |
          (F_OVERFLOW << 6) |
          (F_SIGN << 7)
        );
        break;
      }
      case 37: {
        // *******
        // * PLA *
        // *******

        // Pull accumulator from stack
        REG_ACC = pull();
        F_SIGN = (REG_ACC >> 7) & 1;
        F_ZERO = REG_ACC;
        break;
      }
      case 38: {
        // *******
        // * PLP *
        // *******

        // Pull processor status from stack
        temp = pull();
        F_CARRY = temp & 1;
        F_ZERO = ((temp >> 1) & 1) === 1 ? 0 : 1;
        F_INTERRUPT = (temp >> 2) & 1;
        F_DECIMAL = (temp >> 3) & 1;
        F_BRK = (temp >> 4) & 1;
        F_NOTUSED = (temp >> 5) & 1;
        F_OVERFLOW = (temp >> 6) & 1;
        F_SIGN = (temp >> 7) & 1;

        F_NOTUSED = 1;
        break;
      }
      case 39: {
        // *******
        // * ROL *
        // *******

        // Rotate one bit left
        if (addrMode === 4) {
          // ADDR_ACC = 4

          temp = REG_ACC;
          add = F_CARRY;
          F_CARRY = (temp >> 7) & 1;
          temp = ((temp << 1) & 0xff) + add;
          REG_ACC = temp;
        } else {
          temp = load(addr);
          add = F_CARRY;
          F_CARRY = (temp >> 7) & 1;
          temp = ((temp << 1) & 0xff) + add;
          write(addr, temp);
        }
        F_SIGN = (temp >> 7) & 1;
        F_ZERO = temp;
        break;
      }
      case 40: {
        // *******
        // * ROR *
        // *******

        // Rotate one bit right
        if (addrMode === 4) {
          // ADDR_ACC = 4

          add = F_CARRY << 7;
          F_CARRY = REG_ACC & 1;
          temp = (REG_ACC >> 1) + add;
          REG_ACC = temp;
        } else {
          temp = load(addr);
          add = F_CARRY << 7;
          F_CARRY = temp & 1;
          temp = (temp >> 1) + add;
          write(addr, temp);
        }
        F_SIGN = (temp >> 7) & 1;
        F_ZERO = temp;
        break;
      }
      case 41: {
        // *******
        // * RTI *
        // *******

        // Return from interrupt. Pull status and PC from stack.

        temp = pull();
        F_CARRY = temp & 1;
        F_ZERO = ((temp >> 1) & 1) === 0 ? 1 : 0;
        F_INTERRUPT = (temp >> 2) & 1;
        F_DECIMAL = (temp >> 3) & 1;
        F_BRK = (temp >> 4) & 1;
        F_NOTUSED = (temp >> 5) & 1;
        F_OVERFLOW = (temp >> 6) & 1;
        F_SIGN = (temp >> 7) & 1;

        REG_PC = pull();
        REG_PC += pull() << 8;
        if (REG_PC === 0xffff) {
          return;
        }
        REG_PC--;
        F_NOTUSED = 1;
        break;
      }
      case 42: {
        // *******
        // * RTS *
        // *******

        // Return from subroutine. Pull PC from stack.

        REG_PC = pull();
        REG_PC += pull() << 8;

        if (REG_PC === 0xffff) {
          return; // return from NSF play routine:
        }
        break;
      }
      case 43: {
        // *******
        // * SBC *
        // *******

        temp = REG_ACC - load(addr) - (1 - F_CARRY);
        F_SIGN = (temp >> 7) & 1;
        F_ZERO = temp & 0xff;
        if (
          ((REG_ACC ^ temp) & 0x80) !== 0 &&
          ((REG_ACC ^ load(addr)) & 0x80) !== 0
        ) {
          F_OVERFLOW = 1;
        } else {
          F_OVERFLOW = 0;
        }
        F_CARRY = temp < 0 ? 0 : 1;
        REG_ACC = temp & 0xff;
        if (addrMode !== 11) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }
      case 44: {
        // *******
        // * SEC *
        // *******

        // Set carry flag
        F_CARRY = 1;
        break;
      }
      case 45: {
        // *******
        // * SED *
        // *******

        // Set decimal mode
        F_DECIMAL = 1;
        break;
      }
      case 46: {
        // *******
        // * SEI *
        // *******

        // Set interrupt disable status
        F_INTERRUPT = 1;
        break;
      }
      case 47: {
        // *******
        // * STA *
        // *******

        // Store accumulator in memory
        write(addr, REG_ACC);
        break;
      }
      case 48: {
        // *******
        // * STX *
        // *******

        // Store index X in memory
        write(addr, REG_X);
        break;
      }
      case 49: {
        // *******
        // * STY *
        // *******

        // Store index Y in memory:
        write(addr, REG_Y);
        break;
      }
      case 50: {
        // *******
        // * TAX *
        // *******

        // Transfer accumulator to index X:
        REG_X = REG_ACC;
        F_SIGN = (REG_ACC >> 7) & 1;
        F_ZERO = REG_ACC;
        break;
      }
      case 51: {
        // *******
        // * TAY *
        // *******

        // Transfer accumulator to index Y:
        REG_Y = REG_ACC;
        F_SIGN = (REG_ACC >> 7) & 1;
        F_ZERO = REG_ACC;
        break;
      }
      case 52: {
        // *******
        // * TSX *
        // *******

        // Transfer stack pointer to index X:
        REG_X = REG_SP - 0x0100;
        F_SIGN = (REG_SP >> 7) & 1;
        F_ZERO = REG_X;
        break;
      }
      case 53: {
        // *******
        // * TXA *
        // *******

        // Transfer index X to accumulator:
        REG_ACC = REG_X;
        F_SIGN = (REG_X >> 7) & 1;
        F_ZERO = REG_X;
        break;
      }
      case 54: {
        // *******
        // * TXS *
        // *******

        // Transfer index X to stack pointer:
        REG_SP = REG_X + 0x0100;
        stackWrap();
        break;
      }
      case 55: {
        // *******
        // * TYA *
        // *******

        // Transfer index Y to accumulator:
        REG_ACC = REG_Y;
        F_SIGN = (REG_Y >> 7) & 1;
        F_ZERO = REG_Y;
        break;
      }
      case 56: {
        // *******
        // * ALR *
        // *******

        // Shift right one bit after ANDing:
        temp = REG_ACC & load(addr);
        F_CARRY = temp & 1;
        REG_ACC = F_ZERO = temp >> 1;
        F_SIGN = 0;
        break;
      }
      case 57: {
        // *******
        // * ANC *
        // *******

        // AND accumulator, setting carry to bit 7 result.
        REG_ACC = F_ZERO = REG_ACC & load(addr);
        F_CARRY = F_SIGN = (REG_ACC >> 7) & 1;
        break;
      }
      case 58: {
        // *******
        // * ARR *
        // *******

        // Rotate right one bit after ANDing:
        temp = REG_ACC & load(addr);
        REG_ACC = F_ZERO = (temp >> 1) + (F_CARRY << 7);
        F_SIGN = F_CARRY;
        F_CARRY = (temp >> 7) & 1;
        F_OVERFLOW = ((temp >> 7) ^ (temp >> 6)) & 1;
        break;
      }
      case 59: {
        // *******
        // * AXS *
        // *******

        // Set X to (X AND A) - value.
        temp = (REG_X & REG_ACC) - load(addr);
        F_SIGN = (temp >> 7) & 1;
        F_ZERO = temp & 0xff;
        if (
          ((REG_X ^ temp) & 0x80) !== 0 &&
          ((REG_X ^ load(addr)) & 0x80) !== 0
        ) {
          F_OVERFLOW = 1;
        } else {
          F_OVERFLOW = 0;
        }
        F_CARRY = temp < 0 ? 0 : 1;
        REG_X = temp & 0xff;
        break;
      }
      case 60: {
        // *******
        // * LAX *
        // *******

        // Load A and X with memory:
        REG_ACC = REG_X = F_ZERO = load(addr);
        F_SIGN = (REG_ACC >> 7) & 1;
        cycleCount += cycleAdd;
        break;
      }
      case 61: {
        // *******
        // * SAX *
        // *******

        // Store A AND X in memory:
        write(addr, REG_ACC & REG_X);
        break;
      }
      case 62: {
        // *******
        // * DCP *
        // *******

        // Decrement memory by one:
        temp = (load(addr) - 1) & 0xff;
        write(addr, temp);

        // Then compare with the accumulator:
        temp = REG_ACC - temp;
        F_CARRY = temp >= 0 ? 1 : 0;
        F_SIGN = (temp >> 7) & 1;
        F_ZERO = temp & 0xff;
        if (addrMode !== 11) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }
      case 63: {
        // *******
        // * ISC *
        // *******

        // Increment memory by one:
        temp = (load(addr) + 1) & 0xff;
        write(addr, temp);

        // Then subtract from the accumulator:
        temp = REG_ACC - temp - (1 - F_CARRY);
        F_SIGN = (temp >> 7) & 1;
        F_ZERO = temp & 0xff;
        if (
          ((REG_ACC ^ temp) & 0x80) !== 0 &&
          ((REG_ACC ^ load(addr)) & 0x80) !== 0
        ) {
          F_OVERFLOW = 1;
        } else {
          F_OVERFLOW = 0;
        }
        F_CARRY = temp < 0 ? 0 : 1;
        REG_ACC = temp & 0xff;
        if (addrMode !== 11) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }
      case 64: {
        // *******
        // * RLA *
        // *******

        // Rotate one bit left
        temp = load(addr);
        add = F_CARRY;
        F_CARRY = (temp >> 7) & 1;
        temp = ((temp << 1) & 0xff) + add;
        write(addr, temp);

        // Then AND with the accumulator.
        REG_ACC = REG_ACC & temp;
        F_SIGN = (REG_ACC >> 7) & 1;
        F_ZERO = REG_ACC;
        if (addrMode !== 11) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }
      case 65: {
        // *******
        // * RRA *
        // *******

        // Rotate one bit right
        temp = load(addr);
        add = F_CARRY << 7;
        F_CARRY = temp & 1;
        temp = (temp >> 1) + add;
        write(addr, temp);

        // Then add to the accumulator
        temp = REG_ACC + load(addr) + F_CARRY;

        if (
          ((REG_ACC ^ load(addr)) & 0x80) === 0 &&
          ((REG_ACC ^ temp) & 0x80) !== 0
        ) {
          F_OVERFLOW = 1;
        } else {
          F_OVERFLOW = 0;
        }
        F_CARRY = temp > 255 ? 1 : 0;
        F_SIGN = (temp >> 7) & 1;
        F_ZERO = temp & 0xff;
        REG_ACC = temp & 255;
        if (addrMode !== 11) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }
      case 66: {
        // *******
        // * SLO *
        // *******

        // Shift one bit left
        temp = load(addr);
        F_CARRY = (temp >> 7) & 1;
        temp = (temp << 1) & 255;
        write(addr, temp);

        // Then OR with the accumulator.
        REG_ACC = REG_ACC | temp;
        F_SIGN = (REG_ACC >> 7) & 1;
        F_ZERO = REG_ACC;
        if (addrMode !== 11) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }
      case 67: {
        // *******
        // * SRE *
        // *******

        // Shift one bit right
        temp = load(addr) & 0xff;
        F_CARRY = temp & 1;
        temp >>= 1;
        write(addr, temp);

        // Then XOR with the accumulator.
        REG_ACC = REG_ACC ^ temp;
        F_SIGN = (REG_ACC >> 7) & 1;
        F_ZERO = REG_ACC;
        if (addrMode !== 11) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }
      case 68: {
        // *******
        // * SKB *
        // *******

        // Do nothing
        break;
      }
      case 69: {
        // *******
        // * IGN *
        // *******

        // Do nothing but load.
        // TODO: Properly implement the double-reads.
        load(addr);
        if (addrMode !== 11) cycleCount += cycleAdd; // PostIdxInd = 11
        break;
      }

      default: {
        // *******
        // * ??? *
        // *******

        halt("Game crashed, invalid opcode at address $" + opaddr.toString(16));
        break;
      }
    } // end of switch

    return cycleCount;
  }

  function load(addr) {
    if (addr < 0x2000) {
      return mem[addr & 0x7ff];
    } else {
      return mmap.load(addr);
    }
  }

  function load16bit(addr) {
    if (addr < 0x1fff) {
      return mem[addr & 0x7ff] | (mem[(addr + 1) & 0x7ff] << 8);
    } else {
      return mmap.load(addr) | (mmap.load(addr + 1) << 8);
    }
  }

  function write(addr, val) {
    if (addr < 0x2000) {
      mem[addr & 0x7ff] = val;
    } else {
      mmap.write(addr, val);
    }
  }

  function requestIrq(type) {
    if (irqRequested) {
      if (type === Irq.Normal) {
        return;
      }
      // console.log("too fast irqs. type="+type);
    }
    irqRequested = true;
    irqType = type;
  }

  function push(value) {
    mmap.write(REG_SP, value);
    REG_SP--;
    REG_SP = 0x0100 | (REG_SP & 0xff);
  }

  function stackWrap() {
    REG_SP = 0x0100 | (REG_SP & 0xff);
  }

  function pull() {
    REG_SP++;
    REG_SP = 0x0100 | (REG_SP & 0xff);
    return mmap.load(REG_SP);
  }

  function pageCrossed(addr1, addr2) {
    return (addr1 & 0xff00) !== (addr2 & 0xff00);
  }

  function haltCycles(cycles) {
    cyclesToHalt += cycles;
  }

  function doNonMaskableInterrupt(status) {
    if ((mmap.load(0x2000) & 128) !== 0) {
      // Check whether VBlank Interrupts are enabled

      REG_PC_NEW++;
      push((REG_PC_NEW >> 8) & 0xff);
      push(REG_PC_NEW & 0xff);
      //F_INTERRUPT_NEW = 1;
      push(status);

      REG_PC_NEW =
        mmap.load(0xfffa) | (mmap.load(0xfffb) << 8);
      REG_PC_NEW--;
    }
  }

  function doResetInterrupt() {
    REG_PC_NEW =
      mmap.load(0xfffc) | (mmap.load(0xfffd) << 8);
    REG_PC_NEW--;
  }

  function doIrq(status) {
    REG_PC_NEW++;
    push((REG_PC_NEW >> 8) & 0xff);
    push(REG_PC_NEW & 0xff);
    push(status);
    F_INTERRUPT_NEW = 1;
    F_BRK_NEW = 0;

    REG_PC_NEW =
      mmap.load(0xfffe) | (mmap.load(0xffff) << 8);
    REG_PC_NEW--;
  }

  function getStatus() {
    return (
      F_CARRY |
      (F_ZERO << 1) |
      (F_INTERRUPT << 2) |
      (F_DECIMAL << 3) |
      (F_BRK << 4) |
      (F_NOTUSED << 5) |
      (F_OVERFLOW << 6) |
      (F_SIGN << 7)
    );
  }

  function setStatus(st) {
    F_CARRY = st & 1;
    F_ZERO = (st >> 1) & 1;
    F_INTERRUPT = (st >> 2) & 1;
    F_DECIMAL = (st >> 3) & 1;
    F_BRK = (st >> 4) & 1;
    F_NOTUSED = (st >> 5) & 1;
    F_OVERFLOW = (st >> 6) & 1;
    F_SIGN = (st >> 7) & 1;
  }


}


const INS_ADC = 0;
const INS_AND = 1;
const INS_ASL = 2;

const INS_BCC = 3;
const INS_BCS = 4;
const INS_BEQ = 5;
const INS_BIT = 6;
const INS_BMI = 7;
const INS_BNE = 8;
const INS_BPL = 9;
const INS_BRK = 10;
const INS_BVC = 11;
const INS_BVS = 12;

const INS_CLC = 13;
const INS_CLD = 14;
const INS_CLI = 15;
const INS_CLV = 16;
const INS_CMP = 17;
const INS_CPX = 18;
const INS_CPY = 19;

const INS_DEC = 20;
const INS_DEX = 21;
const INS_DEY = 22;

const INS_EOR = 23;

const INS_INC = 24;
const INS_INX = 25;
const INS_INY = 26;

const INS_JMP = 27;
const INS_JSR = 28;

const INS_LDA = 29;
const INS_LDX = 30;
const INS_LDY = 31;
const INS_LSR = 32;

const INS_NOP = 33;

const INS_ORA = 34;

const INS_PHA = 35;
const INS_PHP = 36;
const INS_PLA = 37;
const INS_PLP = 38;

const INS_ROL = 39;
const INS_ROR = 40;
const INS_RTI = 41;
const INS_RTS = 42;

const INS_SBC = 43;
const INS_SEC = 44;
const INS_SED = 45;
const INS_SEI = 46;
const INS_STA = 47;
const INS_STX = 48;
const INS_STY = 49;

const INS_TAX = 50;
const INS_TAY = 51;
const INS_TSX = 52;
const INS_TXA = 53;
const INS_TXS = 54;
const INS_TYA = 55;

const INS_ALR = 56;
const INS_ANC = 57;
const INS_ARR = 58;
const INS_AXS = 59;
const INS_LAX = 60;
const INS_SAX = 61;
const INS_DCP = 62;
const INS_ISC = 63;
const INS_RLA = 64;
const INS_RRA = 65;
const INS_SLO = 66;
const INS_SRE = 67;
const INS_SKB = 68;
const INS_IGN = 69;

const INS_DUMMY = 70; // dummy instruction used for 'halting' the processor some cycles

// -------------------------------- //

// Addressing modes:
const ADDR_ZP = 0;
const ADDR_REL = 1;
const ADDR_IMP = 2;
const ADDR_ABS = 3;
const ADDR_ACC = 4;
const ADDR_IMM = 5;
const ADDR_ZPX = 6;
const ADDR_ZPY = 7;
const ADDR_ABSX = 8;
const ADDR_ABSY = 9;
const ADDR_PREIDXIND = 10;
const ADDR_POSTIDXIND = 11;
const ADDR_INDABS = 12;

const addrDesc = new Array(
  "Zero Page           ",
  "Relative            ",
  "Implied             ",
  "Absolute            ",
  "Accumulator         ",
  "Immediate           ",
  "Zero Page,X         ",
  "Zero Page,Y         ",
  "Absolute,X          ",
  "Absolute,Y          ",
  "Preindexed Indirect ",
  "Postindexed Indirect",
  "Indirect Absolute   "
);

export function OpData() {
  const opdata = new Array(256);

  // Set all to invalid instruction (to detect crashes):
  opdata.fill(0xff);

  // Now fill in all valid opcodes:

  // ADC:
  setOp(INS_ADC, 0x69, ADDR_IMM, 2, 2);
  setOp(INS_ADC, 0x65, ADDR_ZP, 2, 3);
  setOp(INS_ADC, 0x75, ADDR_ZPX, 2, 4);
  setOp(INS_ADC, 0x6d, ADDR_ABS, 3, 4);
  setOp(INS_ADC, 0x7d, ADDR_ABSX, 3, 4);
  setOp(INS_ADC, 0x79, ADDR_ABSY, 3, 4);
  setOp(INS_ADC, 0x61, ADDR_PREIDXIND, 2, 6);
  setOp(INS_ADC, 0x71, ADDR_POSTIDXIND, 2, 5);

  // AND:
  setOp(INS_AND, 0x29, ADDR_IMM, 2, 2);
  setOp(INS_AND, 0x25, ADDR_ZP, 2, 3);
  setOp(INS_AND, 0x35, ADDR_ZPX, 2, 4);
  setOp(INS_AND, 0x2d, ADDR_ABS, 3, 4);
  setOp(INS_AND, 0x3d, ADDR_ABSX, 3, 4);
  setOp(INS_AND, 0x39, ADDR_ABSY, 3, 4);
  setOp(INS_AND, 0x21, ADDR_PREIDXIND, 2, 6);
  setOp(INS_AND, 0x31, ADDR_POSTIDXIND, 2, 5);

  // ASL:
  setOp(INS_ASL, 0x0a, ADDR_ACC, 1, 2);
  setOp(INS_ASL, 0x06, ADDR_ZP, 2, 5);
  setOp(INS_ASL, 0x16, ADDR_ZPX, 2, 6);
  setOp(INS_ASL, 0x0e, ADDR_ABS, 3, 6);
  setOp(INS_ASL, 0x1e, ADDR_ABSX, 3, 7);

  // BCC:
  setOp(INS_BCC, 0x90, ADDR_REL, 2, 2);

  // BCS:
  setOp(INS_BCS, 0xb0, ADDR_REL, 2, 2);

  // BEQ:
  setOp(INS_BEQ, 0xf0, ADDR_REL, 2, 2);

  // BIT:
  setOp(INS_BIT, 0x24, ADDR_ZP, 2, 3);
  setOp(INS_BIT, 0x2c, ADDR_ABS, 3, 4);

  // BMI:
  setOp(INS_BMI, 0x30, ADDR_REL, 2, 2);

  // BNE:
  setOp(INS_BNE, 0xd0, ADDR_REL, 2, 2);

  // BPL:
  setOp(INS_BPL, 0x10, ADDR_REL, 2, 2);

  // BRK:
  setOp(INS_BRK, 0x00, ADDR_IMP, 1, 7);

  // BVC:
  setOp(INS_BVC, 0x50, ADDR_REL, 2, 2);

  // BVS:
  setOp(INS_BVS, 0x70, ADDR_REL, 2, 2);

  // CLC:
  setOp(INS_CLC, 0x18, ADDR_IMP, 1, 2);

  // CLD:
  setOp(INS_CLD, 0xd8, ADDR_IMP, 1, 2);

  // CLI:
  setOp(INS_CLI, 0x58, ADDR_IMP, 1, 2);

  // CLV:
  setOp(INS_CLV, 0xb8, ADDR_IMP, 1, 2);

  // CMP:
  setOp(INS_CMP, 0xc9, ADDR_IMM, 2, 2);
  setOp(INS_CMP, 0xc5, ADDR_ZP, 2, 3);
  setOp(INS_CMP, 0xd5, ADDR_ZPX, 2, 4);
  setOp(INS_CMP, 0xcd, ADDR_ABS, 3, 4);
  setOp(INS_CMP, 0xdd, ADDR_ABSX, 3, 4);
  setOp(INS_CMP, 0xd9, ADDR_ABSY, 3, 4);
  setOp(INS_CMP, 0xc1, ADDR_PREIDXIND, 2, 6);
  setOp(INS_CMP, 0xd1, ADDR_POSTIDXIND, 2, 5);

  // CPX:
  setOp(INS_CPX, 0xe0, ADDR_IMM, 2, 2);
  setOp(INS_CPX, 0xe4, ADDR_ZP, 2, 3);
  setOp(INS_CPX, 0xec, ADDR_ABS, 3, 4);

  // CPY:
  setOp(INS_CPY, 0xc0, ADDR_IMM, 2, 2);
  setOp(INS_CPY, 0xc4, ADDR_ZP, 2, 3);
  setOp(INS_CPY, 0xcc, ADDR_ABS, 3, 4);

  // DEC:
  setOp(INS_DEC, 0xc6, ADDR_ZP, 2, 5);
  setOp(INS_DEC, 0xd6, ADDR_ZPX, 2, 6);
  setOp(INS_DEC, 0xce, ADDR_ABS, 3, 6);
  setOp(INS_DEC, 0xde, ADDR_ABSX, 3, 7);

  // DEX:
  setOp(INS_DEX, 0xca, ADDR_IMP, 1, 2);

  // DEY:
  setOp(INS_DEY, 0x88, ADDR_IMP, 1, 2);

  // EOR:
  setOp(INS_EOR, 0x49, ADDR_IMM, 2, 2);
  setOp(INS_EOR, 0x45, ADDR_ZP, 2, 3);
  setOp(INS_EOR, 0x55, ADDR_ZPX, 2, 4);
  setOp(INS_EOR, 0x4d, ADDR_ABS, 3, 4);
  setOp(INS_EOR, 0x5d, ADDR_ABSX, 3, 4);
  setOp(INS_EOR, 0x59, ADDR_ABSY, 3, 4);
  setOp(INS_EOR, 0x41, ADDR_PREIDXIND, 2, 6);
  setOp(INS_EOR, 0x51, ADDR_POSTIDXIND, 2, 5);

  // INC:
  setOp(INS_INC, 0xe6, ADDR_ZP, 2, 5);
  setOp(INS_INC, 0xf6, ADDR_ZPX, 2, 6);
  setOp(INS_INC, 0xee, ADDR_ABS, 3, 6);
  setOp(INS_INC, 0xfe, ADDR_ABSX, 3, 7);

  // INX:
  setOp(INS_INX, 0xe8, ADDR_IMP, 1, 2);

  // INY:
  setOp(INS_INY, 0xc8, ADDR_IMP, 1, 2);

  // JMP:
  setOp(INS_JMP, 0x4c, ADDR_ABS, 3, 3);
  setOp(INS_JMP, 0x6c, ADDR_INDABS, 3, 5);

  // JSR:
  setOp(INS_JSR, 0x20, ADDR_ABS, 3, 6);

  // LDA:
  setOp(INS_LDA, 0xa9, ADDR_IMM, 2, 2);
  setOp(INS_LDA, 0xa5, ADDR_ZP, 2, 3);
  setOp(INS_LDA, 0xb5, ADDR_ZPX, 2, 4);
  setOp(INS_LDA, 0xad, ADDR_ABS, 3, 4);
  setOp(INS_LDA, 0xbd, ADDR_ABSX, 3, 4);
  setOp(INS_LDA, 0xb9, ADDR_ABSY, 3, 4);
  setOp(INS_LDA, 0xa1, ADDR_PREIDXIND, 2, 6);
  setOp(INS_LDA, 0xb1, ADDR_POSTIDXIND, 2, 5);

  // LDX:
  setOp(INS_LDX, 0xa2, ADDR_IMM, 2, 2);
  setOp(INS_LDX, 0xa6, ADDR_ZP, 2, 3);
  setOp(INS_LDX, 0xb6, ADDR_ZPY, 2, 4);
  setOp(INS_LDX, 0xae, ADDR_ABS, 3, 4);
  setOp(INS_LDX, 0xbe, ADDR_ABSY, 3, 4);

  // LDY:
  setOp(INS_LDY, 0xa0, ADDR_IMM, 2, 2);
  setOp(INS_LDY, 0xa4, ADDR_ZP, 2, 3);
  setOp(INS_LDY, 0xb4, ADDR_ZPX, 2, 4);
  setOp(INS_LDY, 0xac, ADDR_ABS, 3, 4);
  setOp(INS_LDY, 0xbc, ADDR_ABSX, 3, 4);

  // LSR:
  setOp(INS_LSR, 0x4a, ADDR_ACC, 1, 2);
  setOp(INS_LSR, 0x46, ADDR_ZP, 2, 5);
  setOp(INS_LSR, 0x56, ADDR_ZPX, 2, 6);
  setOp(INS_LSR, 0x4e, ADDR_ABS, 3, 6);
  setOp(INS_LSR, 0x5e, ADDR_ABSX, 3, 7);

  // NOP:
  setOp(INS_NOP, 0x1a, ADDR_IMP, 1, 2);
  setOp(INS_NOP, 0x3a, ADDR_IMP, 1, 2);
  setOp(INS_NOP, 0x5a, ADDR_IMP, 1, 2);
  setOp(INS_NOP, 0x7a, ADDR_IMP, 1, 2);
  setOp(INS_NOP, 0xda, ADDR_IMP, 1, 2);
  setOp(INS_NOP, 0xea, ADDR_IMP, 1, 2);
  setOp(INS_NOP, 0xfa, ADDR_IMP, 1, 2);

  // ORA:
  setOp(INS_ORA, 0x09, ADDR_IMM, 2, 2);
  setOp(INS_ORA, 0x05, ADDR_ZP, 2, 3);
  setOp(INS_ORA, 0x15, ADDR_ZPX, 2, 4);
  setOp(INS_ORA, 0x0d, ADDR_ABS, 3, 4);
  setOp(INS_ORA, 0x1d, ADDR_ABSX, 3, 4);
  setOp(INS_ORA, 0x19, ADDR_ABSY, 3, 4);
  setOp(INS_ORA, 0x01, ADDR_PREIDXIND, 2, 6);
  setOp(INS_ORA, 0x11, ADDR_POSTIDXIND, 2, 5);

  // PHA:
  setOp(INS_PHA, 0x48, ADDR_IMP, 1, 3);

  // PHP:
  setOp(INS_PHP, 0x08, ADDR_IMP, 1, 3);

  // PLA:
  setOp(INS_PLA, 0x68, ADDR_IMP, 1, 4);

  // PLP:
  setOp(INS_PLP, 0x28, ADDR_IMP, 1, 4);

  // ROL:
  setOp(INS_ROL, 0x2a, ADDR_ACC, 1, 2);
  setOp(INS_ROL, 0x26, ADDR_ZP, 2, 5);
  setOp(INS_ROL, 0x36, ADDR_ZPX, 2, 6);
  setOp(INS_ROL, 0x2e, ADDR_ABS, 3, 6);
  setOp(INS_ROL, 0x3e, ADDR_ABSX, 3, 7);

  // ROR:
  setOp(INS_ROR, 0x6a, ADDR_ACC, 1, 2);
  setOp(INS_ROR, 0x66, ADDR_ZP, 2, 5);
  setOp(INS_ROR, 0x76, ADDR_ZPX, 2, 6);
  setOp(INS_ROR, 0x6e, ADDR_ABS, 3, 6);
  setOp(INS_ROR, 0x7e, ADDR_ABSX, 3, 7);

  // RTI:
  setOp(INS_RTI, 0x40, ADDR_IMP, 1, 6);

  // RTS:
  setOp(INS_RTS, 0x60, ADDR_IMP, 1, 6);

  // SBC:
  setOp(INS_SBC, 0xe9, ADDR_IMM, 2, 2);
  setOp(INS_SBC, 0xe5, ADDR_ZP, 2, 3);
  setOp(INS_SBC, 0xf5, ADDR_ZPX, 2, 4);
  setOp(INS_SBC, 0xed, ADDR_ABS, 3, 4);
  setOp(INS_SBC, 0xfd, ADDR_ABSX, 3, 4);
  setOp(INS_SBC, 0xf9, ADDR_ABSY, 3, 4);
  setOp(INS_SBC, 0xe1, ADDR_PREIDXIND, 2, 6);
  setOp(INS_SBC, 0xf1, ADDR_POSTIDXIND, 2, 5);

  // SEC:
  setOp(INS_SEC, 0x38, ADDR_IMP, 1, 2);

  // SED:
  setOp(INS_SED, 0xf8, ADDR_IMP, 1, 2);

  // SEI:
  setOp(INS_SEI, 0x78, ADDR_IMP, 1, 2);

  // STA:
  setOp(INS_STA, 0x85, ADDR_ZP, 2, 3);
  setOp(INS_STA, 0x95, ADDR_ZPX, 2, 4);
  setOp(INS_STA, 0x8d, ADDR_ABS, 3, 4);
  setOp(INS_STA, 0x9d, ADDR_ABSX, 3, 5);
  setOp(INS_STA, 0x99, ADDR_ABSY, 3, 5);
  setOp(INS_STA, 0x81, ADDR_PREIDXIND, 2, 6);
  setOp(INS_STA, 0x91, ADDR_POSTIDXIND, 2, 6);

  // STX:
  setOp(INS_STX, 0x86, ADDR_ZP, 2, 3);
  setOp(INS_STX, 0x96, ADDR_ZPY, 2, 4);
  setOp(INS_STX, 0x8e, ADDR_ABS, 3, 4);

  // STY:
  setOp(INS_STY, 0x84, ADDR_ZP, 2, 3);
  setOp(INS_STY, 0x94, ADDR_ZPX, 2, 4);
  setOp(INS_STY, 0x8c, ADDR_ABS, 3, 4);

  // TAX:
  setOp(INS_TAX, 0xaa, ADDR_IMP, 1, 2);

  // TAY:
  setOp(INS_TAY, 0xa8, ADDR_IMP, 1, 2);

  // TSX:
  setOp(INS_TSX, 0xba, ADDR_IMP, 1, 2);

  // TXA:
  setOp(INS_TXA, 0x8a, ADDR_IMP, 1, 2);

  // TXS:
  setOp(INS_TXS, 0x9a, ADDR_IMP, 1, 2);

  // TYA:
  setOp(INS_TYA, 0x98, ADDR_IMP, 1, 2);

  // ALR:
  setOp(INS_ALR, 0x4b, ADDR_IMM, 2, 2);

  // ANC:
  setOp(INS_ANC, 0x0b, ADDR_IMM, 2, 2);
  setOp(INS_ANC, 0x2b, ADDR_IMM, 2, 2);

  // ARR:
  setOp(INS_ARR, 0x6b, ADDR_IMM, 2, 2);

  // AXS:
  setOp(INS_AXS, 0xcb, ADDR_IMM, 2, 2);

  // LAX:
  setOp(INS_LAX, 0xa3, ADDR_PREIDXIND, 2, 6);
  setOp(INS_LAX, 0xa7, ADDR_ZP, 2, 3);
  setOp(INS_LAX, 0xaf, ADDR_ABS, 3, 4);
  setOp(INS_LAX, 0xb3, ADDR_POSTIDXIND, 2, 5);
  setOp(INS_LAX, 0xb7, ADDR_ZPY, 2, 4);
  setOp(INS_LAX, 0xbf, ADDR_ABSY, 3, 4);

  // SAX:
  setOp(INS_SAX, 0x83, ADDR_PREIDXIND, 2, 6);
  setOp(INS_SAX, 0x87, ADDR_ZP, 2, 3);
  setOp(INS_SAX, 0x8f, ADDR_ABS, 3, 4);
  setOp(INS_SAX, 0x97, ADDR_ZPY, 2, 4);

  // DCP:
  setOp(INS_DCP, 0xc3, ADDR_PREIDXIND, 2, 8);
  setOp(INS_DCP, 0xc7, ADDR_ZP, 2, 5);
  setOp(INS_DCP, 0xcf, ADDR_ABS, 3, 6);
  setOp(INS_DCP, 0xd3, ADDR_POSTIDXIND, 2, 8);
  setOp(INS_DCP, 0xd7, ADDR_ZPX, 2, 6);
  setOp(INS_DCP, 0xdb, ADDR_ABSY, 3, 7);
  setOp(INS_DCP, 0xdf, ADDR_ABSX, 3, 7);

  // ISC:
  setOp(INS_ISC, 0xe3, ADDR_PREIDXIND, 2, 8);
  setOp(INS_ISC, 0xe7, ADDR_ZP, 2, 5);
  setOp(INS_ISC, 0xef, ADDR_ABS, 3, 6);
  setOp(INS_ISC, 0xf3, ADDR_POSTIDXIND, 2, 8);
  setOp(INS_ISC, 0xf7, ADDR_ZPX, 2, 6);
  setOp(INS_ISC, 0xfb, ADDR_ABSY, 3, 7);
  setOp(INS_ISC, 0xff, ADDR_ABSX, 3, 7);

  // RLA:
  setOp(INS_RLA, 0x23, ADDR_PREIDXIND, 2, 8);
  setOp(INS_RLA, 0x27, ADDR_ZP, 2, 5);
  setOp(INS_RLA, 0x2f, ADDR_ABS, 3, 6);
  setOp(INS_RLA, 0x33, ADDR_POSTIDXIND, 2, 8);
  setOp(INS_RLA, 0x37, ADDR_ZPX, 2, 6);
  setOp(INS_RLA, 0x3b, ADDR_ABSY, 3, 7);
  setOp(INS_RLA, 0x3f, ADDR_ABSX, 3, 7);

  // RRA:
  setOp(INS_RRA, 0x63, ADDR_PREIDXIND, 2, 8);
  setOp(INS_RRA, 0x67, ADDR_ZP, 2, 5);
  setOp(INS_RRA, 0x6f, ADDR_ABS, 3, 6);
  setOp(INS_RRA, 0x73, ADDR_POSTIDXIND, 2, 8);
  setOp(INS_RRA, 0x77, ADDR_ZPX, 2, 6);
  setOp(INS_RRA, 0x7b, ADDR_ABSY, 3, 7);
  setOp(INS_RRA, 0x7f, ADDR_ABSX, 3, 7);

  // SLO:
  setOp(INS_SLO, 0x03, ADDR_PREIDXIND, 2, 8);
  setOp(INS_SLO, 0x07, ADDR_ZP, 2, 5);
  setOp(INS_SLO, 0x0f, ADDR_ABS, 3, 6);
  setOp(INS_SLO, 0x13, ADDR_POSTIDXIND, 2, 8);
  setOp(INS_SLO, 0x17, ADDR_ZPX, 2, 6);
  setOp(INS_SLO, 0x1b, ADDR_ABSY, 3, 7);
  setOp(INS_SLO, 0x1f, ADDR_ABSX, 3, 7);

  // SRE:
  setOp(INS_SRE, 0x43, ADDR_PREIDXIND, 2, 8);
  setOp(INS_SRE, 0x47, ADDR_ZP, 2, 5);
  setOp(INS_SRE, 0x4f, ADDR_ABS, 3, 6);
  setOp(INS_SRE, 0x53, ADDR_POSTIDXIND, 2, 8);
  setOp(INS_SRE, 0x57, ADDR_ZPX, 2, 6);
  setOp(INS_SRE, 0x5b, ADDR_ABSY, 3, 7);
  setOp(INS_SRE, 0x5f, ADDR_ABSX, 3, 7);

  // SKB:
  setOp(INS_SKB, 0x80, ADDR_IMM, 2, 2);
  setOp(INS_SKB, 0x82, ADDR_IMM, 2, 2);
  setOp(INS_SKB, 0x89, ADDR_IMM, 2, 2);
  setOp(INS_SKB, 0xc2, ADDR_IMM, 2, 2);
  setOp(INS_SKB, 0xe2, ADDR_IMM, 2, 2);

  // SKB:
  setOp(INS_IGN, 0x0c, ADDR_ABS, 3, 4);
  setOp(INS_IGN, 0x1c, ADDR_ABSX, 3, 4);
  setOp(INS_IGN, 0x3c, ADDR_ABSX, 3, 4);
  setOp(INS_IGN, 0x5c, ADDR_ABSX, 3, 4);
  setOp(INS_IGN, 0x7c, ADDR_ABSX, 3, 4);
  setOp(INS_IGN, 0xdc, ADDR_ABSX, 3, 4);
  setOp(INS_IGN, 0xfc, ADDR_ABSX, 3, 4);
  setOp(INS_IGN, 0x04, ADDR_ZP, 2, 3);
  setOp(INS_IGN, 0x44, ADDR_ZP, 2, 3);
  setOp(INS_IGN, 0x64, ADDR_ZP, 2, 3);
  setOp(INS_IGN, 0x14, ADDR_ZPX, 2, 4);
  setOp(INS_IGN, 0x34, ADDR_ZPX, 2, 4);
  setOp(INS_IGN, 0x54, ADDR_ZPX, 2, 4);
  setOp(INS_IGN, 0x74, ADDR_ZPX, 2, 4);
  setOp(INS_IGN, 0xd4, ADDR_ZPX, 2, 4);
  setOp(INS_IGN, 0xf4, ADDR_ZPX, 2, 4);

  // prettier-ignore
  const cycTable = new Array(
    /*0x00*/ 7, 6, 2, 8, 3, 3, 5, 5, 3, 2, 2, 2, 4, 4, 6, 6,
    /*0x10*/ 2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7,
    /*0x20*/ 6, 6, 2, 8, 3, 3, 5, 5, 4, 2, 2, 2, 4, 4, 6, 6,
    /*0x30*/ 2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7,
    /*0x40*/ 6, 6, 2, 8, 3, 3, 5, 5, 3, 2, 2, 2, 3, 4, 6, 6,
    /*0x50*/ 2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7,
    /*0x60*/ 6, 6, 2, 8, 3, 3, 5, 5, 4, 2, 2, 2, 5, 4, 6, 6,
    /*0x70*/ 2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7,
    /*0x80*/ 2, 6, 2, 6, 3, 3, 3, 3, 2, 2, 2, 2, 4, 4, 4, 4,
    /*0x90*/ 2, 6, 2, 6, 4, 4, 4, 4, 2, 5, 2, 5, 5, 5, 5, 5,
    /*0xA0*/ 2, 6, 2, 6, 3, 3, 3, 3, 2, 2, 2, 2, 4, 4, 4, 4,
    /*0xB0*/ 2, 5, 2, 5, 4, 4, 4, 4, 2, 4, 2, 4, 4, 4, 4, 4,
    /*0xC0*/ 2, 6, 2, 8, 3, 3, 5, 5, 2, 2, 2, 2, 4, 4, 6, 6,
    /*0xD0*/ 2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7,
    /*0xE0*/ 2, 6, 3, 8, 3, 3, 5, 5, 2, 2, 2, 2, 4, 4, 6, 6,
    /*0xF0*/ 2, 5, 2, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7
  );

  const instname = new Array(70);

  // Instruction Names:
  instname[0] = "ADC";
  instname[1] = "AND";
  instname[2] = "ASL";
  instname[3] = "BCC";
  instname[4] = "BCS";
  instname[5] = "BEQ";
  instname[6] = "BIT";
  instname[7] = "BMI";
  instname[8] = "BNE";
  instname[9] = "BPL";
  instname[10] = "BRK";
  instname[11] = "BVC";
  instname[12] = "BVS";
  instname[13] = "CLC";
  instname[14] = "CLD";
  instname[15] = "CLI";
  instname[16] = "CLV";
  instname[17] = "CMP";
  instname[18] = "CPX";
  instname[19] = "CPY";
  instname[20] = "DEC";
  instname[21] = "DEX";
  instname[22] = "DEY";
  instname[23] = "EOR";
  instname[24] = "INC";
  instname[25] = "INX";
  instname[26] = "INY";
  instname[27] = "JMP";
  instname[28] = "JSR";
  instname[29] = "LDA";
  instname[30] = "LDX";
  instname[31] = "LDY";
  instname[32] = "LSR";
  instname[33] = "NOP";
  instname[34] = "ORA";
  instname[35] = "PHA";
  instname[36] = "PHP";
  instname[37] = "PLA";
  instname[38] = "PLP";
  instname[39] = "ROL";
  instname[40] = "ROR";
  instname[41] = "RTI";
  instname[42] = "RTS";
  instname[43] = "SBC";
  instname[44] = "SEC";
  instname[45] = "SED";
  instname[46] = "SEI";
  instname[47] = "STA";
  instname[48] = "STX";
  instname[49] = "STY";
  instname[50] = "TAX";
  instname[51] = "TAY";
  instname[52] = "TSX";
  instname[53] = "TXA";
  instname[54] = "TXS";
  instname[55] = "TYA";
  instname[56] = "ALR";
  instname[57] = "ANC";
  instname[58] = "ARR";
  instname[59] = "AXS";
  instname[60] = "LAX";
  instname[61] = "SAX";
  instname[62] = "DCP";
  instname[63] = "ISC";
  instname[64] = "RLA";
  instname[65] = "RRA";
  instname[66] = "SLO";
  instname[67] = "SRE";
  instname[68] = "SKB";
  instname[69] = "IGN";

  function setOp(inst, op, addr, size, cycles) {
    opdata[op] =
      (inst & 0xff) |
      ((addr & 0xff) << 8) |
      ((size & 0xff) << 16) |
      ((cycles & 0xff) << 24);
  }
}

export default CPU;
