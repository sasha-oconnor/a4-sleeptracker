import { importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IonicStorageModule } from '@ionic/storage-angular';

import { SleepService } from './sleep.service';

describe('SleepService', () => {
  let service: SleepService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [importProvidersFrom(IonicStorageModule.forRoot())] });
    service = TestBed.inject(SleepService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
