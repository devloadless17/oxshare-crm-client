import { apiClient } from './client';

export interface KycField {
  id: string;
  fieldName: string;
  label: string;
  fieldType: 'text' | 'number' | 'select' | 'file' | 'date' | 'checkbox';
  options?: string[];
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface KycSubmissionValue {
  fieldId: string;
  valueText?: string;
  fileUrl?: string;
  fileName?: string;
}

export const kycApi = {
  async getActiveFields(): Promise<KycField[]> {
    try {
      const { data } = await apiClient.get<KycField[]>('/compliance/fields?active=true');
      return data;
    } catch {
      // Fallback default dynamic fields if server offline
      return [
        { id: '1', fieldName: 'id_document', label: 'Government Photo ID (Passport / National ID)', fieldType: 'file', isRequired: true, isActive: true, sortOrder: 1 },
        { id: '2', fieldName: 'proof_of_address', label: 'Proof of Address (Utility Bill / Bank Statement)', fieldType: 'file', isRequired: true, isActive: true, sortOrder: 2 },
        { id: '3', fieldName: 'tax_id', label: 'Tax Identification Number (TIN / SSN)', fieldType: 'text', isRequired: false, isActive: true, sortOrder: 3 },
        { id: '4', fieldName: 'country_residence', label: 'Country of Residence', fieldType: 'select', options: ['United Arab Emirates', 'Saudi Arabia', 'Kuwait', 'Qatar', 'United Kingdom'], isRequired: true, isActive: true, sortOrder: 4 },
      ];
    }
  },

  async submitKyc(userId: string, values: KycSubmissionValue[]) {
    const { data } = await apiClient.post('/compliance/submit', { userId, values });
    return data;
  },

  async getStatus(userId: string) {
    const { data } = await apiClient.get(`/compliance/status/${userId}`);
    return data;
  },
};
