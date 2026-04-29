import { Controller, Get, Param, Query } from '@nestjs/common';
import { PublicService } from './public.service';
import { EthAddressPipe } from '../../common/pipes/eth-address.pipe';
import type { SortOption } from '../slabs/slabs.service';

@Controller('public')
export class PublicController {
  constructor(private publicService: PublicService) {}

  @Get('address/:address/summary')
  async getAddressSummary(@Param('address', EthAddressPipe) address: string) {
    return this.publicService.getAddressSummary(address);
  }

  @Get('address/:address/valuation')
  async getWalletValuation(@Param('address', EthAddressPipe) address: string) {
    return this.publicService.getWalletValuation(address);
  }

  @Get('slabs/:slabId')
  async getSlab(@Param('slabId') slabId: string) {
    return this.publicService.getSlabById(slabId);
  }

  @Get('address/:address/slabs')
  async getAddressSlabs(
    @Param('address', EthAddressPipe) address: string,
    @Query('set') set?: string,
    @Query('q') q?: string,
    @Query('grade') grade?: string,
    @Query('page') page?: string,
    @Query('sort') sort?: string,
  ) {
    return this.publicService.getAddressSlabs(address, {
      set,
      q,
      grade,
      sort: sort as SortOption | undefined,
      page: page ? parseInt(page, 10) : undefined,
    });
  }

  @Get('address/:address/slabs-by-set')
  async getAddressSlabsBySet(@Param('address', EthAddressPipe) address: string) {
    return this.publicService.getAddressSlabsBySet(address);
  }

  @Get('address/:address/sets/:setName')
  async getAddressSetDetail(
    @Param('address', EthAddressPipe) address: string,
    @Param('setName') setName: string,
  ) {
    const decoded = decodeURIComponent(setName);
    return this.publicService.getAddressSetDetail(address, decoded);
  }

  @Get('address/:address/sets')
  async getAddressSets(@Param('address', EthAddressPipe) address: string) {
    return this.publicService.getAddressSets(address);
  }
}
