import React, { useState, useEffect } from 'react';
import { Building2, X, Plus, Check } from 'lucide-react';
import { Supplier } from '../types/quotation';

interface NewSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSupplier: (supplier: { id?: string; name: string; phone?: string }) => void;
  supplierToEdit?: Supplier | null;
}

export const NewSupplierModal: React.FC<NewSupplierModalProps> = ({
  isOpen,
  onClose,
  onSaveSupplier,
  supplierToEdit,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (supplierToEdit) {
      setName(supplierToEdit.name);
      setPhone(supplierToEdit.phone || '');
    } else {
      setName('');
      setPhone('');
    }
  }, [supplierToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSaveSupplier({
      id: supplierToEdit?.id,
      name: name.trim(),
      phone: phone.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5 text-purple-700" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {supplierToEdit ? 'Editar Fornecedor' : 'Adicionar Novo Fornecedor'}
              </h3>
              <p className="text-xs text-slate-500">
                Uma nova coluna de preços será adicionada ao mapa comparativo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nome do Fornecedor / Distribuidor *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Comercial Ramos, Dismap, Tramontina..."
              className="w-full text-sm bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Telefone / WhatsApp (opcional)
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ex: 31987654321"
              className="w-full text-sm bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Usado para abrir o WhatsApp Web direto ao gerar o pedido de compra.
            </p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              {supplierToEdit ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Salvar Alterações</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Fornecedor</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
